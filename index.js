var defaults = require('levelup-defaults')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var duplexify = require('duplexify')
var merge = require('merge-stream')
var through = require('through2')
var split = require('split2')
var pump = require('pump')
var pumpify = require('pumpify')
var multiplex = require('multiplex')
var collect = require('collect-stream')
var once = require('once')
var extend = require('xtend')

inherits(Drive, EventEmitter)
module.exports = Drive

function Drive (opts) {
  var self = this
  if (!(self instanceof Drive)) return new Drive(opts)
  EventEmitter.call(self)
  self.setMaxListeners(Number.MAX_VALUE)
  self.db = defaults(opts.db, { valueEncoding: 'binary' })
  self._drive = opts.drive
  self._archives = {}
  self._archive = null
  self.key = null
  self._ready = false

  self.db.get('links', { valueEncoding: 'json' }, function (err, links) {
    if (err && !notfound(err)) return self.emit('error', err)
    if (!links) links = { self: null, links: [] }
    if (links.self) {
      self.key = Buffer(links.self, 'hex')
      self._archive = self._drive.createArchive(self.key, { live: true })
      self._archives[links.self] = self._archive
      ready(links)
    } else {
      self._archive = self._drive.createArchive(null, { live: true })
      var key = self._archive.key.toString('hex')
      self.key = self._archive.key
      self._archives[key] = self._archive
      links.self = key
      links.links.push(key)
      self.db.put('links', links, { valueEncoding: 'json' }, function (err) {
        if (err) return self.emit('error', err)
        ready(links)
      })
    }
  })
  function ready (links) {
    var lns = links.links.concat(links.self)
    lns.forEach(function (link) {
      if (!self._archives[link]) {
        self._archives[link] = self._drive.createArchive(
          Buffer(link,'hex'), { live: true })
      }
      addListeners(self._archives[link], link)
    })
    self._ready = true
    self.emit('_ready', self._archive, self._archives)
  }
  function addListeners (archive, link) {
    archive.setMaxListeners(Number.MAX_VALUE)
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

Drive.prototype.list = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }
  if (!opts) opts = {}
  var d = duplexify.obj()
  if (cb) {
    opts = extend(opts, { live: false })
    collect(d, cb)
  }
  this._getArchives(function (archive, archives) {
    d.setReadable(merge(Object.keys(archives).map(function (link) {
      var r = archives[link].list(opts)
      return pumpify.obj(r, through.obj(function (row, enc, next) {
        row.link = link
        next(null, row)
      }))
    })))
  })
  return d
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
    var key = linkfor(entry.link)
    if (!archives[key]) {
      cb(new Error('archive not found with link: ' + key))
    } else archives[linkfor(entry.link)].get(entry.index, opts, cb)
  })
}

Drive.prototype.download = function (entry, opts, cb) {
  this._getArchives(function (archive, archives) {
    var key = linkfor(entry.link)
    if (!archives[key]) {
      cb(new Error('archive not found with link: ' + key))
    } else archives[key].download(entry, opts, cb)
  })
}

Drive.prototype.createFileReadStream = function (entry) {
  var d = duplexify()
  this._getArchives(function (archive, archives) {
    var key = linkfor(entry.link)
    if (!archives[key]) {
      d.emit('error', new Error('archive not found with link: ' + key))
    } else {
      var e = extend(entry)
      delete e.blocks
      delete e.content
      d.setReadable(archives[key].createFileReadStream(e))
    }
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
      else queue.push(['seek', n, cb])
    },
    next: function (cb) {
      if (error) {
        cb(error)
        error = null
      } else if (cur) cur.next(cb)
      else queue.push(['next',cb])
    }
  }
  this._getArchives(function (archive, archives) {
    var key = linkfor(entry.link)
    if (!archives[key]) {
      error = new Error('archive not found with link: ' + key)
    } else cur = archives[key].createByteCursor(entry)
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

Drive.prototype.replicate = function (opts) {
  if (!opts) opts = {}
  var self = this
  var d = duplexify()
  self._getArchives(function (archive, archives) {
    var plex = multiplex()
    var meta = plex.createSharedStream('meta')
    meta.write(JSON.stringify({
      type: 'have-archives',
      links: Object.keys(archives)
    })+'\n')
    var have = false
    pump(meta, split(parse), through.obj(write), meta)
    function parse (str) {
      try { return JSON.parse(str) }
      catch (err) { this.emit('error', err) }
    }
    function write (row, enc, next) {
      if (!row) next()
      else if (!have && row.type === 'have-archives') {
        if (!Array.isArray(row.links)) {
          return next(null, '{"error":"links array expected"}\n')
        } else if (!row.links.every(ishex)) {
          return next(null, '{"error":"links must be hex strings"}\n')
        }
        have = true
        createArchives(row.links, next)
      } else next()
    }
    function createArchives (links, cb) {
      cb = once(cb)
      var nlinks = {
        self: archive.key.toString('hex'),
        links: Object.keys(archives).sort()
      }
      var added = 0
      links.forEach(function (link) {
        if (!self._archives[link]) {
          nlinks.links.push(link)
          added++
        }
      })
      if (added > 0) {
        nlinks.links.sort()
        self.db.put('links', nlinks, { valueEncoding: 'json' }, function (err) {
          if (err) return cb(err)
          else ready(nlinks)
        })
      } else ready(nlinks)

      function ready (links) {
        links.links.forEach(function (link) {
          if (!self._archives[link]) {
            self._archives[link] = self._drive.createArchive(
              Buffer(link,'hex'), { live: true })
          }
          var r = self._archives[link].replicate(extend(opts))
          r.once('error', cb)
          r.pipe(plex.createSharedStream(link)).pipe(r)
        })
      }
    }
    d.setReadable(plex)
    d.setWritable(plex)
  })
  return d
}
Drive.prototype.unreplicate = function () {} // TODO

function notfound (err) {
  return err && (err.notFound || /^notfound/i.test(err))
}
function ishex (str) {
  return typeof str === 'string' && /^[A-Fa-f0-9]+$/.test(str)
}
function linkfor (x) {
  return typeof x === 'string' ? x : x.toString('hex')
}
