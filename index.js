var path = require('path');
var fs = require('fs');
var stripAnsi = require('strip-ansi');
var mkdirp = require('mkdirp');
var extend = require('deep-extend');

var assets = {};
var DEFAULT_OUTPUT_FILENAME = 'webpack-stats.json';
var DEFAULT_LOG_TIME = false;


function Plugin(options) {
  this.contents = {};
  this.options = options || {};
  this.options.filename = this.options.filename || DEFAULT_OUTPUT_FILENAME;
  if (this.options.logTime === undefined) {
    this.options.logTime = DEFAULT_LOG_TIME;
  }
}

Plugin.prototype.apply = function(compiler) {
    var self = this;

    compiler.plugin('compilation', function(compilation, callback) {
      compilation.plugin('failed-module', function(fail){
        var output = {
          status: 'error',
          error: fail.error.name || 'unknown-error'
        };
        if (fail.error.module !== undefined) {
          output.file = fail.error.module.userRequest;
        }
        if (fail.error.error !== undefined) {
          output.message = stripAnsi(fail.error.error.codeFrame);
        } else {
          output.message = '';
        }
        self.writeOutput(compiler, output);
      });
    });

    compiler.plugin('compile', function(factory, callback) {
      self.writeOutput(compiler, {status: 'compiling'});
    });

    compiler.plugin('done', function(stats){
      if (stats.compilation.errors.length > 0) {
        var error = stats.compilation.errors[0];
        self.writeOutput(compiler, {
          status: 'error',
          error: error['name'] || 'unknown-error',
          message: stripAnsi(error['message'])
        });
        return;
      }

      var chunks = {};
      stats.compilation.chunks.map(function(chunk){
        var files = chunk.files.map(function(file){
          var F = {name: file};
          if (compiler.options.output.publicPath) {
            F.publicPath= compiler.options.output.publicPath + file;
          }
          if (compiler.options.output.path) {
            F.path = path.join(compiler.options.output.path, file);
          }
          return F;
        });
        chunks[chunk.name] = files;
      });

      var chunkKeys = Object.keys(chunks);
      Object.keys(stats.compilation.assets).map(function(asset){

        // checking for gzipped js files
        // NOTE: files must be in format [name]-[anything].[ext] (emphasis on the '[name]-' part)
        // EXAMPLE: public_website-1234567890.js.jgz (we use .jgz because safari doesn't support .gz)
        var splitAssetName = asset.split('-'); // based on above example, should be: ['public_website', '1234567890.js.jgz']
        var assetChunkName = splitAssetName[0];
        var assetHashAndExt = splitAssetName[1];
        if (chunkKeys.includes(assetChunkName) && assetHashAndExt.includes('js.jgz')) {
          var F = {name: asset};
          if (compiler.options.output.publicPath) {
            F.publicPath = compiler.options.output.publicPath + asset;
          }
          if (compiler.options.output.path) {
            F.path = path.join(compiler.options.output.path, asset);
          }
          chunks[assetChunkName].push(F)
        }

      });

      var output = {
        status: 'done',
        chunks: chunks
      };

      if (self.options.logTime === true) {
        output.startTime = stats.startTime;
        output.endTime = stats.endTime;
      }

      self.writeOutput(compiler, output);
    });
};


Plugin.prototype.writeOutput = function(compiler, contents) {
  var outputDir = this.options.path || '.';
  var outputFilename = path.join(outputDir, this.options.filename || DEFAULT_OUTPUT_FILENAME);
  if (compiler.options.output.publicPath) {
    contents.publicPath = compiler.options.output.publicPath;
  }
  mkdirp.sync(path.dirname(outputFilename));

  this.contents = extend(this.contents, contents);
  fs.writeFileSync(
    outputFilename,
    JSON.stringify(this.contents, null, this.options.indent)
  );
};

module.exports = Plugin;
