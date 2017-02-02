var fs      = require('fs'),
    path    = require('path'),
    mkdirp  = require('mkdirp'),
    Jimp    = require('jimp');

var qt = {};

module.exports = qt;

// express 4 deprecation support
function sendfile(res, file) {
  res[res.sendFile ? 'sendFile' : 'sendfile'](file);
}

// Take an image from src, and write it to dst
qt.convert = function (options, callback) {
  var src   = options.src,
    dst     = options.dst,
    width   = parseInt(options.width, 10) || 100,
    height  = parseInt(options.height, 10) || 100,
    quality = parseInt(options.quality, 10) || 95;

  mkdirp(path.dirname(dst));

  try {
    Jimp.read(src, function (err, image) {
      if (err) {
        return callback(err);
      }

      image
        .cover(width, height) 
        .quality(quality)
        .write(dst, function (err, image) {
          if (err) {
            return callback(err);
          }
          callback(null, dst);
        });
    });
  }
  catch (err) {
    return callback('qt.convert() ERROR: ' + err.message);
  }
};


// express/connect middleware
qt.static = function (root, options) {

  root = path.normalize(root);

  options || (options = {});
  options.type || (options.type = 'cover');
  options.cacheDir || (options.cacheDir = path.join(root, '.cache'));

  return function (req, res, next) {
    var file = decodeURI(req.url.replace(/\?.*/, '')),
      dim = req.query.dim || "",
      orig = path.normalize(root + file),
      dst = path.join(options.cacheDir, options.type, dim, file);

    function send_if_exists(file, callback) {
      fs.exists(file, function (exists) {
        if (!exists) {
          return callback();
        }

        fs.stat(file, function (err, stats) {
          if (err) {
            console.error(err);
            return callback();
          }
          else if (stats.isFile()) {
            // Check if the original image has been changed since the cache file
            // was created and if so, recreate it, otherwise send cached file.
            fs.stat(orig, function (err, origStats) {
              if (err) {
                console.error(err);
              } else if (origStats.mtime.getTime() > stats.mtime.getTime()) {
                return callback();
              }
              return sendfile(res, file);
            });
          }
          else {
            callback();
          }
        });
      });
    }

    if (!dim) {
      return send_if_exists(orig, next);
    }

    send_if_exists(dst, function () {
      var dims = dim.split(/x/g),
          opts = {
            src     : orig,
            dst     : dst,
            width   : dims[0],
            height  : dims[1],
            quality : options.quality,
          };

      qt.convert(opts, function (err, dst) {
        if (err) {
          console.error(err);
          return next();
        }
        sendfile(res, dst);
      });
    });
  };
};
