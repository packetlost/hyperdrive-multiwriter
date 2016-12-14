# hyperdrive-multiwriter

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


