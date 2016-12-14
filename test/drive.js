var test = require('tape')
var multidrive = require('../')
var hyperdrive = require('hyperdrive')
var memdb = require('memdb')
var concat = require('concat-stream')

test('drive', function (t) {
  t.plan(30)
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
    var opts = { live: true }
    var r0 = mdrive0.replicate(opts)
    var r1 = mdrive1.replicate(opts)
    r0.pipe(r1).pipe(r0)

    setTimeout(function () {
      var r2 = mdrive1.replicate(opts)
      var r3 = mdrive2.replicate(opts)
      r2.pipe(r3).pipe(r2)
    }, 100)
    setTimeout(check, 200)
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
        t.error(err)
        t.equal(buf.toString(), 'HI')
      }))
      var e1 = { name: 'cool.txt', link: mdrive1.key }
      drive.createFileReadStream(e1).pipe(concat(function (buf) {
        t.error(err)
        t.equal(buf.toString(), 'COOL')
      }))
      var e2 = { name: 'hello.txt', link: mdrive2.key }
      drive.createFileReadStream(e2).pipe(concat(function (buf) {
        t.error(err)
        t.equal(buf.toString(), 'WHATEVEr')
      }))
    }
  }
})
