# hyperdrive-multiwriter

present a bundle of hyperdrive archives together as a multi-writer view

This module create a writable archive on each database and creates readable
archives for every other remote peer. The data from these archives are presented
as a single view, even though there are many archives behind the scenes.

# example

``` js
var multidrive = require('hyperdrive-multiwriter')
var hyperdrive = require('hyperdrive')
var level = require('level')
var sub = require('subleveldown')

var db = level(process.argv[2])
var mdrive = multidrive({
  db: db,
  drive: hyperdrive(sub(db,'d'))
})

if (process.argv[3] === 'list') {
  mdrive.list(function (err, entries) {
    entries.forEach(function (entry) {
      console.log(JSON.stringify(entry))
    })
  })
} else if (process.argv[3] === 'read') {
  var entry = JSON.parse(process.argv[4])
  mdrive.createFileReadStream(entry).pipe(process.stdout)
} else if (process.argv[3] === 'write') {
  process.stdin.pipe(mdrive.createFileWriteStream(process.argv[4]))
} else if (process.argv[3] === 'sync') {
  var r = mdrive.replicate()
  process.stdin.pipe(r).pipe(process.stdout)
}
```

create some data:

``` sh
$ echo HI | node drive.js /tmp/a write hello.txt
$ echo HOWDY | node drive.js /tmp/b write hello.txt
$ echo WHATEVER | node drive.js /tmp/c write cool.txt
```

gossip replication (`npm install -g dupsh`):

``` sh
$ dupsh 'node drive.js /tmp/a sync' 'node drive.js /tmp/b sync'
^C
$ dupsh 'node drive.js /tmp/b sync' 'node drive.js /tmp/c sync'
^C
$ dupsh 'node drive.js /tmp/a sync' 'node drive.js /tmp/b sync'
^C
```

now each node has all the data:

``` sh
$ node drive.js /tmp/a list
{"name":"hello.txt","linkname":"","length":3,"blocks":1,"mode":0,"uid":0,"gid":0,"mtime":0,"ctime":0,"content":{"blockOffset":0,"bytesOffset":0},"type":"file","link":"a9310f51ee8e9e4bc805866b1ae0bf3d94be055843b1f4f3d55ea275946f1dcb"}
{"name":"cool.txt","linkname":"","length":9,"blocks":1,"mode":0,"uid":0,"gid":0,"mtime":0,"ctime":0,"content":{"blockOffset":0,"bytesOffset":0},"type":"file","link":"c34e0d868ae6371dff499733befe5213f9cf1573a4bb14eb4eb105f2a7408860"}
{"name":"hello.txt","linkname":"","length":6,"blocks":1,"mode":0,"uid":0,"gid":0,"mtime":0,"ctime":0,"content":{"blockOffset":0,"bytesOffset":0},"type":"file","link":"d4934913d24da13f9ede9e56ccf71f769db29252b95cab59ea08e7cd6ea845ce"}
$ node drive.js /tmp/a read '{"name":"cool.txt","link":"c34e0d868ae6371dff499733befe5213f9cf1573a4bb14eb4eb105f2a7408860"}'
WHATEVER
```

# api

``` js
var multidrive = require('hyperdrive-multiwriter')
```

## var mdrive = multidrive(opts)

Create a multi-writer hyperdrive instance `mdrive` from `opts`:

* `opts.db` - levelup database
* `opts.drive` - hyperdrive instance

`mdrive` has most of the same methods as a hyperdrive archive instance.

The rest of the `opts` are passed through to `drive.createArchive(opts)`.

## var r = mdrive.list(opts, cb)

Return a readable stream `r` with entries from all the archives or collect all
the entries as `cb(err, entries)`.

Each entry has an `entry.link` hex string added to it to associate it with the
proper archive..

## var w = mdrive.createFileWriteStream(entry)

Store data in the archive by writing to a writable stream `w`.

`entry` should be an object or a string interpreted as `entry.name`.

## var r = mdrive.createFileReadStream(entry)

Create a readable stream for the contents of `entry`.

`entry` should have an `entry.link` and `entry.name`.

## mdrive.append(entry, cb)

Append an entry into the writable archive.

## mdrive.get(entry, opts, cb)

Read an entry from the archive as `cb(err, entry)`.

## mdrive.download(entry, opts, cb)

Fully download a file/entry from the archive.

## mdrive.close(cb)

Close all resources.

## var cursor = mdrive.createByteCursor(entry)

Create a `cursor` that can seek and traverse `entry`.

## var stream = mdrive.replicate()

Return a duplex `stream` for replication that multiplexes the replication
streams of all the underlying archives along with a coordinator channel to
create the required readable archives on both sides of the connection.

## mdrive.unreplicate(stream)

Stop replicating a `stream`. If `stream` isn't given, stops all replication
stream on `mdrive`.

# install

```
npm install hyperdrive-multiwriter
```

# license

BSD
