"use strict";
var assert = require('assert');
var request = require("request");
var helper = require("../helper.js");

var soajs = require('soajs');
var urac;

var Mongo = soajs.mongo;
var dbConfig = require("./db.config.test.js");

var provisioningConfig = dbConfig();
provisioningConfig.name = "core_provision";
var mongoProvisioning = new Mongo(provisioningConfig);

var sessionConfig = dbConfig();
sessionConfig.name = "core_session";
var mongoSession = new Mongo(sessionConfig);

var uracConfig = dbConfig();
uracConfig.name = "test_urac";
var mongo = new Mongo(uracConfig);

var extKey = 'aa39b5490c4a4ed0e56d7ec1232a428f771e8bb83cfcee16de14f735d0f5da587d5968ec4f785e38570902fd24e0b522b46cb171872d1ea038e88328e7d973ff47d9392f72b2d49566209eb88eb60aed8534a965cf30072c39565bd8d72f68ac';

function requester(apiName, method, params, cb) {
	var options = {
		uri: 'http://127.0.0.1:4000/urac/' + apiName,
		headers: {
			key: extKey,
			'Content-Type': 'application/json'
		},
		json: true
	};
	
	if (params.headers) {
		for (var h in params.headers) {
			if (Object.hasOwnProperty.call(params.headers, h)) {
				options.headers[h] = params.headers[h];
			}
			else {
				
			}
		}
	}
	
	if (params.form) {
		options.body = params.form;
	}
	
	if (params.qs) {
		options.qs = params.qs;
	}
	
	request[method](options, function (error, response, body) {
		assert.ifError(error);
		assert.ok(body);
		return cb(null, body);
	});
}

describe("admin urac tests", function () {
	var uId;
	
	afterEach(function (done) {
		console.log("=======================================");
		done();
	});
	var gId;

	describe("testing admin user API", function () {
		describe("testing add user API", function () {
			it("SUCCESS - will add user account", function (done) {
				var params = {
					qs: {
						'tCode': 'test'
					},
					form: {
						'firstName': 'john',
						'lastName': 'smith',
						'email': 'john.smith@soajs.org',
						'username': 'smith123',
						'status': 'active',
						'config': {}
					}
				};

				requester('owner/admin/addUser', 'post', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					assert.ok(body.data);
					console.log(JSON.stringify(body));

					mongo.findOne("users", {'username': 'smith123'}, function (error, userRecord) {
						assert.ifError(error);
						assert.ok(userRecord);
						delete userRecord.password;
						delete userRecord.ts;
						uId = userRecord._id.toString();
						done();
					});

				});
			});
		});

		describe("testing edit user API", function () {
			it("SUCCESS - will update user account", function (done) {
				var params = {
					qs: {
						'uId': uId,
						'tCode': 'test'
					},
					form: {
						'firstName': 'john',
						'lastName': 'smith',
						'email': 'john.smith@soajs.org',
						'username': 'smith123',
						'status': 'active',
						'config': {
							'keys': {},
							'packages': {
								'TPROD_EX03': {
									'acl': {
										'example01': {}
									}
								}
							}
						}
					}
				};
				
				requester('owner/admin/editUser', 'post', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					assert.ok(body.data);
					console.log(JSON.stringify(body));
					done();
				});
			});
		});
		
		describe("testing change user status API", function () {
			
			it("SUCCESS - will inactivate user", function (done) {
				var params = {
					qs: {
						'uId': uId,
						'tCode': 'test',
						'status': 'inactive'
					}
				};
				requester('owner/admin/changeUserStatus', 'get', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					mongo.findOne('users', {'_id': mongo.ObjectId(uId)}, function (error, userRecord) {
						assert.ifError(error);
						assert.ok(userRecord);
						assert.equal(userRecord.status, 'inactive');
						done();
					});
				});
			});
			
		});
		
		describe("testing admin get user API", function () {
			it("Success", function (done) {
				var params = {
					qs: {
						'uId': uId,
						'tCode': 'test'
					}
				};
				requester('owner/admin/getUser', 'get', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					assert.equal(body.data._id, uId);
					done();
				});
			});
			
		});
		
		describe("testing list users API", function () {
			it("SUCCESS - will return user records", function (done) {
				var params = {
					qs: {
						'tCode': 'test'
					}
				};
				requester('owner/admin/listUsers', 'get', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					assert.ok(body.data.length > 0);
					done();
				});
			});
		});
	});

	describe("testing admin group API", function () {
		describe("testing add group API", function () {
			it("SUCCESS - will create new group", function (done) {
				var params = {
					qs: {
						'tCode': 'test'
					},
					form: {
						'code': 'gold',
						'name': 'Gold',
						'description': 'grp description'
					}
				};
				requester('owner/admin/group/add', 'post', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);

					mongo.findOne('groups', {'code': 'gold'}, function (error, record) {
						assert.ifError(error);
						assert.ok(record);
						console.log(record);
						gId = record._id.toString();// will be used by other test cases
						done();
					});
				});
			});
		});

		describe("testing edit group API", function () {

			it("SUCCESS - will edit group", function (done) {
				var params = {
					qs: {
						'gId': gId,
						'tCode': 'test'
					},
					form: {
						'name': 'gold name',
						'description': 'description update'
					}
				};
				requester('owner/admin/group/edit', 'post', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					done();
				});

			});
		});

		describe("testing assign users API", function () {

			it("SUCCESS - will map grp to users", function (done) {
				var params = {
					qs: {
						'tCode': 'test'
					},
					form: {
						'groupCode': 'gold',
						'users': ['smith123']
					}
				};
				requester('owner/admin/group/addUsers', 'post', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					done();
				});
			});

		});

		describe("testing list groups API", function () {

			it("SUCCESS - will return grps records", function (done) {
				var params = {
					qs: {
						'tCode': 'test'
					}
				};
				requester('owner/admin/group/list', 'get', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					assert.ok(body.data.length > 0);
					done();
				});
			});


		});

		describe("testing delete group API", function () {
			it("SUCCESS - will delete group gold", function (done) {
				var params = {
					qs: {
						'gId': gId,
						'tCode': 'test'
					}
				};
				requester('owner/admin/group/delete', 'get', params, function (error, body) {
					assert.ifError(error);
					assert.ok(body);
					console.log(JSON.stringify(body));
					assert.ok(body.data);
					done();
				});
			});

		});
	});
	
});