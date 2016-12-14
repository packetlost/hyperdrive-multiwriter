var multidrive = require('../')
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
  process.stdin.pipe(mdrive.replicate()).pipe(process.stdout)
}
