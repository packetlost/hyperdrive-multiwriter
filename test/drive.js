var test = require('tape')
var multidrive = require('../')
var hyperdrive = require('hyperdrive')
var memdb = require('memdb')
var concat = require('concat-stream')

test('drive', function (t) {
  t.plan(21)
  var mdrive0 = multidrive({ db: memdb(), drive: hyperdrive(memdb()) })
  var mdrive1 = multidrive({ db: memdb(), drive: hyperdrive(memdb()) })
  var mdrive2 = multidrive({ db: memdb(), drive: hyperdrive(memdb()) })
  var pending = 3
  var w0 = mdrive0.createFileWriteStream('hello.txt')
  var w1 = mdrive1.createFileWriteStream('cool.txt')
  var w2 = mdrive2.createFileWriteStream('hello.txt')
  w0.once('finish', done)
  w1.once('finish', done)
  w2.once('finish', done)
  w0.end('HI')
  w1.end('COOL')
  w2.end('WHATEVEr')
  function done () { if (--pending === 0) ready() }

  function ready () {
    var pending = 3
    mdrive0.list(function (err, entries) {
      t.equal(entries.length, 1)
      t.equal(entries[0].name, 'hello.txt', 'pre list 0')
      if (--pending === 0) sync()
    })
    mdrive1.list(function (err, entries) {
      t.equal(entries.length, 1)
      t.equal(entries[0].name, 'cool.txt', 'pre list 1')
      if (--pending === 0) sync()
    })
    mdrive2.list(function (err, entries) {
      t.equal(entries.length, 1)
      t.equal(entries[0].name, 'hello.txt', 'pre list 2')
      if (--pending === 0) sync()
    })
  }
  function sync () {
    rep(mdrive0, mdrive1)
    setTimeout(function () {
      rep(mdrive1, mdrive2)
      setTimeout(function () {
        rep(mdrive0, mdrive1)
        setTimeout(function () {
          check()
        }, 100)
      }, 100)
    }, 100)
    function rep (a, b) {
      var r0 = a.replicate()
      var r1 = b.replicate()
      r0.pipe(r1).pipe(r0)
    }
  }
  function check () {
    var expected = [
      { name: 'cool.txt' },
      { name: 'hello.txt' },
      { name: 'hello.txt' }
    ]
    mdrive0.list(function (err, entries) {
      t.error(err)
      t.deepEqual(entries.sort(cmp).map(fields), expected, 'list 0')
      checkdocs(mdrive0)
    })
    mdrive1.list(function (err, entries) {
      t.error(err)
      t.deepEqual(entries.sort(cmp).map(fields), expected, 'list 1')
      checkdocs(mdrive1)
    })
    mdrive2.list(function (err, entries) {
      t.error(err)
      t.deepEqual(entries.sort(cmp).map(fields), expected, 'list 2')
      checkdocs(mdrive2)
    })
 
    function cmp (a, b) { return a.name < b.name ? -1 : 1 }
    function fields (x) { return { name: x.name } }

    function checkdocs (drive) {
      var e0 = { name: 'hello.txt', link: mdrive0.key }
      drive.createFileReadStream(e0).pipe(concat(function (buf) {
        t.equal(buf.toString(), 'HI')
      }))
      var e1 = { name: 'cool.txt', link: mdrive1.key }
      drive.createFileReadStream(e1).pipe(concat(function (buf) {
        t.equal(buf.toString(), 'COOL')
      }))
      var e2 = { name: 'hello.txt', link: mdrive2.key }
      drive.createFileReadStream(e2).pipe(concat(function (buf) {
        t.equal(buf.toString(), 'WHATEVEr')
      }))
    }
  }
})
