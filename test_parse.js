// test2 insert
/// http://mongodb.github.io/node-mongodb-native/api-generated/collection.html
// type 'mocha test_find.js'
var Parser = require('./pmx').Parser,
    assert = require('assert'),
    fs = require('fs');

//describe('collection', function () {
//    describe('find', function () {
//        /// fields enumerated find example
//        it('fields enumerated find example', function () {
          fs.readFile('akagi.pmx', function(err, data){
            assert.equal(null, err);
//            console.log(data);
            Parser.parse(data, function(err, pmxdata) {
              console.log(JSON.stringify(pmxdata));
//		this.push('face', JSON.stringify(face_list));
            });
          });
//        });
//    });
//});
