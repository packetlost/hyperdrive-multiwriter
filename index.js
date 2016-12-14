var hyperdrive = require('hyperdrive')
var defaults = require('levelup-defaults')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var duplexify = require('duplexify')
var merge = require('merge-stream')
var through = require('through2')
var pump = require('pumpify').obj

inherits(Drive, EventEmitter)
module.exports = Drive

function Drive (opts) {
  var self = this
  if (!(self instanceof Drive)) return new Drive(opts)
  EventEmitter.call(self)
  self.db = defaults(opts.db, { valueEncoding: 'binary' })
  self._drive = opts.drive
  self._archives = {}
  self._archive = null
  self._ready = false

  self.db.get('links', { valueEncoding: 'json' }, function (err, links) {
    if (err && !notfound(err)) return self.emit('error', err)
    if (!links) links = []
    if (links[0]) {
      self._archive = self._drive.createArchive(links[0])
      self._archives[links[0]] = self._archive
      ready(links)
    } else {
      self._archive = self._drive.createArchive()
      var key = self._archive.key.toString('hex')
      self._archives[key] = self._archive
      links.push(key)
      self.db.put('links', links, { valueEncoding: 'json' }, function (err) {
        if (err) return self.emit('error', err)
        ready(links)
      })
    }
  })
  function ready (links) {
    links.forEach(function (link) {
      if (!self._archives[link]) {
        self._archives[link] = self._drive.createArchive(Buffer(link,'hex'))
      }
      addListeners(self._archives[link], link)
    })
    self._ready = true
    self.emit('_ready', self._archive, self._archives)
  }
  function addListeners (archive, link) {
    archive.on('download', function (data) {
      self.emit('download', data, link)
    })
    archive.on('upload', function (data) {
      self.emit('upload', data, link)
    })
  }
}

Drive.prototype._getArchives = function (cb) {
  if (this._ready) cb(this._archive, this._archives)
  else this.once('_ready', cb)
}

Drive.prototype.list = function (opts) {
  var d = duplexify.obj()
  this._getArchives(function (archive, archives) {
    d.setReadable(merge(Object.keys(archives).map(function (link) {
      var r = archives[link].list(opts)
      return pump(r, through.obj(function (row, enc, next) {
        row.link = link
        next(null, row)
      }))
    })))
  })
}

Drive.prototype.createFileWriteStream = function (entry) {
  var d = duplexify()
  this._getArchives(function (archive, archives) {
    d.setWritable(archive.createFileWriteStream(entry))
  })
  return d
}

Drive.prototype.append = function (entry, cb) {
  this._getArchives(function (archive, archives) {
    archive.append(entry, cb)
  })
}

Drive.prototype.get = function (entry, opts, cb) {
  this._getArchives(function (archive, archives) {
    if (!archives[entry.link]) {
      cb(new Error('archive not found with link: ' + entry.link))
    } else archives[entry.link].get(entry.index, opts, cb)
  })
}

Drive.prototype.download = function (entry, opts, cb) {
  this._getArchives(function (archive, archives) {
    if (!archives[entry.link]) {
      cb(new Error('archive not found with link: ' + entry.link))
    } else archives[entry.link].download(entry, opts, cb)
  })
}

Drive.prototype.createFileReadStream = function (entry) {
  var d = duplexify()
  this._getArchives(function (archive, archives) {
    if (!archives[entry.link]) {
      d.emit('error', new Error('archive not found with link: ' + entry.link))
    } else d.setReadable(archives[entry.link].createFileReadStream(entry))
  })
  return d
}

Drive.prototype.createByteCursor = function (entry) {
  var queue = [], cur = null, error = null
  var cursor = {
    seek: function (n, cb) {
      if (error) {
        cb(error)
        error = null
      } else if (cur) cur.seek(n, cb)
      } else queue.push(['seek', n, cb])
    },
    next: function (cb) {
      if (error) {
        cb(error)
        error = null
      } else if (cur) cur.next(cb)
      } else queue.push(['next',cb])
    }
  }
  this._getArchives(function (archive, archives) {
    if (!archives[entry.link]) {
      error = new Error('archive not found with link: ' + entry.link)
    } else cur = archives[entry.link].createByteCursor(entry)
    for (var i = 0; i < queue.length; i++) {
      if (error && queue[i][0] === 'next') {
        queue[i][1](error)
        error = null
      } else if (cur) {
        cur[queue[i][0]](queue[i][1], queue[i][2])
      }
    }
    queue = []
  })
  return cursor
}

Drive.prototype.replicate = function () {}
Drive.prototype.unreplicate = function () {}

function notfound (err) {
  return err && (err.notFound || /^notfound/i.test(err))
}
