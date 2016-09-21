'use strict';
var soajsUtils = require('soajs/lib/').utils;
var soajsCore = require('soajs');
var fs = require("fs");

var uuid = require('node-uuid');

var userCollectionName = "users";
var tokenCollectionName = "tokens";
var groupsCollectionName = "groups";

function checkIfError(req, res, data, flag, cb) {
	if (data.error) {
		if (typeof (data.error) === 'object' && data.error.message) {
			req.soajs.log.error(data.error);
		}
		if (flag) {
			libProduct.model.closeConnection(req.soajs);
		}
		return res.jsonp(req.soajs.buildResponse({"code": data.code, "msg": req.soajs.config.errors[data.code]}));
	}
	else {
		return cb();
	}
}

var utils = require("./utils.js");

var libProduct = {
	"model": null,
	
	"guest": {
		"login": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			function login(req, cb) {
				var criteria = {
					'username': req.soajs.inputmaskData['username'], 'status': 'active'
				};
				var pattern = req.soajs.validator.SchemaPatterns.email;
				if (pattern.test(req.soajs.inputmaskData['username'])) {
					delete criteria.username;
					criteria.email = req.soajs.inputmaskData['username'];
				}
				var combo = {
					collection: userCollectionName,
					condition: criteria
				};
				libProduct.model.findEntry(req.soajs, combo, function (err, record) {
					if (record) {
						utils.comparePwd(req.soajs.servicesConfig.urac, req.soajs.inputmaskData.password, record.password, req.soajs.config, function (err, response) {
							if (err || !response) {
								libProduct.model.closeConnection(req.soajs);
								return cb(400);
							}
							delete record.password;
							//Get Groups config
							if (record.groups && Array.isArray(record.groups) && record.groups.length > 0) {
								var grpCriteria = {
									"code": {"$in": record.groups}
								};
								if (record.tenant) {
									grpCriteria.tenant = record.tenant;
								}
								var combo = {
									collection: groupsCollectionName,
									condition: grpCriteria
								};
								
								libProduct.model.findEntries(req.soajs, combo, function (err, groups) {
									libProduct.model.closeConnection(req.soajs);
									record.groupsConfig = null;
									if (err) {
										req.soajs.log.error(err);
									}
									else {
										record.groupsConfig = groups;
									}
									return cb(null, record);
								});
							}
							else {
								libProduct.model.closeConnection(req.soajs);
								return cb(null, record);
							}
						});
					}
					else {
						req.soajs.log.error('User not Found');
						libProduct.model.closeConnection(req.soajs);
						return cb(401);
					}
				});
			}
			
			login(req, function (err, record) {
				if (err) {
					return res.jsonp(req.soajs.buildResponse({"code": err, "msg": req.soajs.config.errors[err]}));
				}
				else {
					var cloneRecord = soajsUtils.cloneObj(record);
					req.soajs.session.setURAC(cloneRecord, function (err) {
						var data = {error: err, code: 401};
						checkIfError(req, res, data, false, function () {
							if (record.config && record.config.packages) {
								delete record.config.packages;
							}
							if (record.config && record.config.keys) {
								delete record.config.keys;
							}
							return res.jsonp(req.soajs.buildResponse(null, record));
						});
						
					});
				}
			});
		},
		"checkUsername": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			var combo = {
				collection: userCollectionName,
				condition: {
					'username': req.soajs.inputmaskData['username']
				}
			};
			libProduct.model.countEntries(req.soajs, combo, function (err, userRecord) {
				libProduct.model.closeConnection(req.soajs);
				checkIfError(req, res, {
					error: err,
					code: 600,
					config: req.soajs.config
				}, false, function () {
					var status = (userRecord > 0);
					return res.jsonp(req.soajs.buildResponse(null, status));
				});
			});
		},
		"join": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			var requireValidation = true;
			if (req.soajs.servicesConfig.urac) {
				if (Object.hasOwnProperty.call(req.soajs.servicesConfig.urac, 'validateJoin')) {
					requireValidation = req.soajs.servicesConfig.urac.validateJoin;
				}
			}
			var cond = {
				$or: [
					{'username': req.soajs.inputmaskData['username']},
					{'email': req.soajs.inputmaskData['email']}
				]
			};
			var combo = {
				collection: userCollectionName,
				condition: cond
			};
			
			libProduct.model.findEntry(req.soajs, combo, function (err, record) {
				var data = {
					config: req.soajs.config, error: err, code: 403
				};
				checkIfError(req, res, data, true, function () {
					//user exits
					if (record) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 402, "msg": req.soajs.config.errors[402]}));
					}
					
					var userRecord = {
						"username": req.soajs.inputmaskData['username'],
						"password": utils.encryptPwd(req.soajs.servicesConfig.urac, req.soajs.inputmaskData['password'], req.soajs.config), //encrypt the password
						"firstName": req.soajs.inputmaskData['firstName'],
						"lastName": req.soajs.inputmaskData['lastName'],
						"email": req.soajs.inputmaskData['email'],
						'status': (requireValidation) ? 'pendingJoin' : 'active',
						'ts': new Date().getTime(),
						'groups': [],
						'profile': {},
						'config': {
							'packages': {},
							'keys': {}
						},
						"tenant": {
							"id": req.soajs.tenant.id.toString(),
							"code": req.soajs.tenant.code
						}
					};
					var combo = {
						collection: userCollectionName,
						record: userRecord
					};
					//add record in db
					libProduct.model.insertEntry(req.soajs, combo, function (err, record) {
						data.error = err || !record;
						data.code = 403;
						checkIfError(req, res, data, true, function () {
							//no validation needed stop and return
							var returnObj = {
								id: record[0]._id.toString()
							};
							if (requireValidation && req.soajs.servicesConfig.mail && req.soajs.servicesConfig.urac.mail && req.soajs.servicesConfig.urac.mail.join) {
								var tokenRecord = {
									'userId': record[0]._id.toString(),
									'token': uuid.v4(),
									'expires': new Date(new Date().getTime() + req.soajs.servicesConfig.urac.tokenExpiryTTL),
									'status': 'active',
									'ts': new Date().getTime(),
									'service': 'join',
									'username': record[0].username
								};
								var combo = {
									collection: tokenCollectionName,
									record: tokenRecord
								};
								libProduct.model.insertEntry(req.soajs, combo, function (err) {
									libProduct.model.closeConnection(req.soajs);
									data.error = err;
									checkIfError(req, res, data, false, function () {
										//send an email to the user
										var data = userRecord;
										data.link = {
											join: utils.addTokenToLink(req.soajs.servicesConfig.urac.link.join, tokenRecord.token)
										};
										utils.sendMail('join', req, data, function (error) {
											returnObj.token = tokenRecord.token;
											return res.jsonp(req.soajs.buildResponse(null, returnObj));
										});
									});
								});
							}
							else {
								libProduct.model.closeConnection(req.soajs);
								return res.jsonp(req.soajs.buildResponse(null, returnObj));
							}
						});
					});
				});
			});
		},
		"forgotPassword": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			var combo = {
				collection: userCollectionName,
				condition: {
					'$or': [
						{'username': req.soajs.inputmaskData['username']},
						{'email': req.soajs.inputmaskData['username']}
					],
					'status': 'active'
				}
			};
			libProduct.model.findEntry(req.soajs, combo, function (err, userRecord) {
				if (err || !userRecord) {
					libProduct.model.closeConnection(req.soajs);
					return res.jsonp(req.soajs.buildResponse({"code": 406, "msg": req.soajs.config.errors[406]}));
				}
				
				var tokenRecord = {
					'userId': userRecord._id.toString(),
					'token': uuid.v4(),
					'expires': new Date(new Date().getTime() + req.soajs.servicesConfig.urac.tokenExpiryTTL),
					'status': 'active',
					'ts': new Date().getTime(),
					'service': 'forgotPassword',
					'username': userRecord.username
				};
				
				var combo1 = {
					collection: tokenCollectionName,
					condition: {
						'userId': tokenRecord.userId,
						'service': 'forgotPassword',
						'status': 'active'
					},
					updatedFields: {
						'$set': {'status': 'invalid'}
					}
				};
				
				libProduct.model.updateEntry(req.soajs, combo1, function (err) {
					var data = {
						config: req.soajs.config,
						error: err, code: 407
					};
					checkIfError(req, res, data, true, function () {
						var combo2 = {
							collection: tokenCollectionName,
							record: tokenRecord
						};
						libProduct.model.insertEntry(req.soajs, combo2, function (err) {
							libProduct.model.closeConnection(req.soajs);
							data.error = err;
							checkIfError(req, res, data, false, function () {
								if (req.soajs.servicesConfig.mail && req.soajs.servicesConfig.urac.mail && req.soajs.servicesConfig.urac.mail.forgotPassword) {
									//send an email to the user
									var data = userRecord;
									data.link = {
										forgotPassword: utils.addTokenToLink(req.soajs.servicesConfig.urac.link.forgotPassword, tokenRecord.token)
									};
									
									utils.sendMail('forgotPassword', req, data, function () {
										return res.jsonp(req.soajs.buildResponse(null, tokenRecord.token));
									});
								}
								else {
									return res.jsonp(req.soajs.buildResponse(null, tokenRecord.token));
								}
							});
						});
					});
				});
			});
		},
		"resetPassword": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			//get token
			var combo = {
				collection: tokenCollectionName,
				condition: {
					'token': req.soajs.inputmaskData['token'],
					'service': {'$in': ['forgotPassword', 'addUser']},
					'status': 'active'
				}
			};
			libProduct.model.findEntry(req.soajs, combo, function (err, tokenRecord) {
				if (err || !tokenRecord) {
					libProduct.model.closeConnection(req.soajs);
					return res.jsonp(req.soajs.buildResponse({"code": 406, "msg": req.soajs.config.errors[406]}));
				}
				
				//check if token expired
				if (new Date(tokenRecord.expires).getTime() < new Date().getTime()) {
					libProduct.model.closeConnection(req.soajs);
					return res.jsonp(req.soajs.buildResponse({"code": 406, "msg": req.soajs.config.errors[406]}));
				}
				libProduct.model.validateId(req.soajs, tokenRecord.userId, function (err, id) {
					
					var combo = {
						collection: userCollectionName,
						condition: {'_id': id}
					};
					//get user record
					libProduct.model.findEntry(req.soajs, combo, function (error, userRecord) {
						var data = {config: req.soajs.config, error: error || !userRecord, code: 406};
						checkIfError(req, res, data, true, function () {
							//update token status
							tokenRecord.status = 'used';
							
							//hash the password and update user record status
							userRecord.status = 'active';
							userRecord.password = utils.encryptPwd(req.soajs.servicesConfig.urac, req.soajs.inputmaskData['password'], req.soajs.config);
							
							var combo = {
								collection: tokenCollectionName,
								record: tokenRecord
							};
							//save token in database
							libProduct.model.saveEntry(req.soajs, combo, function (err) {
								data.error = err;
								data.code = 407;
								checkIfError(req, res, data, true, function () {
									var combo1 = {
										collection: userCollectionName,
										record: userRecord
									};
									//save user record in database
									libProduct.model.saveEntry(req.soajs, combo1, function (err) {
										libProduct.model.closeConnection(req.soajs);
										data.error = err;
										checkIfError(req, res, data, false, function () {
											return res.jsonp(req.soajs.buildResponse(null, true));
										});
									});
								});
							});
						});
					});
				});
				
			});
		},
		"joinValidate": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			//get token
			var token = {
				'token': req.soajs.inputmaskData['token'],
				'service': 'join',
				'status': 'active'
			};
			var combo = {
				collection: tokenCollectionName,
				condition: token
			};
			libProduct.model.findEntry(req.soajs, combo, function (err, tokenRecord) {
				var data = {config: req.soajs.config, error: err || !tokenRecord, code: 406};
				checkIfError(req, res, data, true, function () {
					//check if token expired
					if (new Date(tokenRecord.expires).getTime() < new Date().getTime()) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 406, "msg": req.soajs.config.errors[406]}));
					}
					libProduct.model.validateId(req.soajs, tokenRecord.userId, function (e, userId) {
						var combo = {
							collection: userCollectionName,
							condition: {
								'_id': userId,
								'status': 'pendingJoin'
							}
						};
						//get user record
						libProduct.model.findEntry(req.soajs, combo, function (error, userRecord) {
							data.error = error || !userRecord;
							checkIfError(req, res, data, true, function () {
								//update token status
								tokenRecord.status = 'used';
								userRecord.status = 'active';
								var combo = {
									collection: tokenCollectionName,
									record: tokenRecord
								};
								//save token in database
								libProduct.model.saveEntry(req.soajs, combo, function (err) {
									data.error = err;
									data.code = 407;
									checkIfError(req, res, data, false, function () {
										var combo = {
											collection: userCollectionName,
											record: userRecord
										};
										//save user record in database
										libProduct.model.saveEntry(req.soajs, combo, function (err) {
											libProduct.model.closeConnection(req.soajs);
											data.error = err;
											checkIfError(req, res, data, false, function () {
												return res.jsonp(req.soajs.buildResponse(null, true));
											});
										});
									});
								});
							});
						});
					});
				});
			});
		},
		"changeEmailValidate": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			var token = {
				'token': req.soajs.inputmaskData['token'],
				'service': 'changeEmail',
				'status': 'active'
			};
			var combo = {
				collection: tokenCollectionName,
				condition: token
			};
			libProduct.model.findEntry(req.soajs, combo, function (err, tokenRecord) {
				if (err || !tokenRecord) {
					libProduct.model.closeConnection(req.soajs);
					req.soajs.log.error('Invalid Token');
					return res.jsonp(req.soajs.buildResponse({"code": 406, "msg": req.soajs.config.errors[406]}));
				}
				
				//check if token expired
				if (new Date(tokenRecord.expires).getTime() < new Date().getTime()) {
					libProduct.model.closeConnection(req.soajs);
					req.soajs.log.error('Expired Token');
					return res.jsonp(req.soajs.buildResponse({"code": 406, "msg": req.soajs.config.errors[406]}));
				}
				libProduct.model.validateId(req.soajs, tokenRecord.userId, function (err, userId) {
					var combo = {
						collection: userCollectionName,
						condition: {'_id': userId}
					};
					//get user record
					libProduct.model.findEntry(req.soajs, combo, function (error, userRecord) {
						var data = {config: req.soajs.config, error: error || !userRecord, code: 406};
						checkIfError(req, res, data, true, function () {
							//update token status
							tokenRecord.status = 'used';
							
							//update user record email
							userRecord.email = tokenRecord.email;
							var combo1 = {
								collection: tokenCollectionName,
								record: tokenRecord
							};
							//save token in database
							libProduct.model.saveEntry(req.soajs, combo1, function (err) {
								data.error = err;
								data.code = 407;
								checkIfError(req, res, data, true, function () {
									var combo2 = {
										collection: userCollectionName,
										record: userRecord
									};
									//save user record in database
									libProduct.model.saveEntry(req.soajs, combo2, function (err) {
										libProduct.model.closeConnection(req.soajs);
										data.error = err;
										checkIfError(req, res, data, false, function () {
											return res.jsonp(req.soajs.buildResponse(null, true));
										});
									});
								});
							});
						});
					});
				});
			});
		}
	},
	"account": {
		"editProfile": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			utils.updateUserRecord(req, libProduct, false, function (error) {
				if (error) {
					return res.jsonp(req.soajs.buildResponse({"code": error.code, "msg": error.msg}));
				}
				return res.jsonp(req.soajs.buildResponse(null, true));
			});
		},
		"changeEmail": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			//check if user account is there
			libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['uId'], function (err, userId) {
				if (err) {
					libProduct.model.closeConnection(req.soajs);
					return res.jsonp(req.soajs.buildResponse({"code": 411, "msg": req.soajs.config.errors[411]}));
				}
				var combo = {
					collection: userCollectionName,
					condition: {'_id': userId}
				};
				libProduct.model.findEntry(req.soajs, combo, function (err, userRecord) {
					var data = {config: req.soajs.config, error: err, code: 405};
					checkIfError(req, res, data, true, function () {
						if (userRecord.email === req.soajs.inputmaskData['email']) {
							libProduct.model.closeConnection(req.soajs);
							return res.jsonp(req.soajs.buildResponse({
								"code": 412,
								"msg": req.soajs.config.errors[412]
							}));
						}
						
						//create new token
						var tokenRecord = {
							'userId': userRecord._id.toString(),
							'token': uuid.v4(),
							'expires': new Date(new Date().getTime() + req.soajs.servicesConfig.urac.tokenExpiryTTL),
							'status': 'active',
							'ts': new Date().getTime(),
							'service': 'changeEmail',
							'email': req.soajs.inputmaskData['email'],
							'username': userRecord.username
						};
						var combo = {
							collection: tokenCollectionName,
							condition: {
								'userId': tokenRecord.userId,
								'service': 'changeEmail',
								'status': 'active'
							},
							updatedFields: {'$set': {'status': 'invalid'}}
						};
						//set the old tokens to invalid
						libProduct.model.updateEntry(req.soajs, combo, function (err) {
							data.error = err;
							data.code = 407;
							checkIfError(req, res, data, true, function () {
								var combo = {
									collection: tokenCollectionName,
									record: tokenRecord
								};
								//insert newly created token
								libProduct.model.insertEntry(req.soajs, combo, function (err) {
									libProduct.model.closeConnection(req.soajs);
									data.error = err;
									checkIfError(req, res, data, false, function () {
										
										//email notification
										if (req.soajs.servicesConfig.mail && req.soajs.servicesConfig.urac.mail && req.soajs.servicesConfig.urac.mail.changeEmail) {
											//send an email to the user
											var data = JSON.parse(JSON.stringify(userRecord));
											data.email = req.soajs.inputmaskData['email'];
											data.link = {
												changeEmail: utils.addTokenToLink(req.soajs.servicesConfig.urac.link.changeEmail, tokenRecord.token)
											};
											
											utils.sendMail('changeEmail', req, data, function (error) {
												return res.jsonp(req.soajs.buildResponse(null, tokenRecord.token));
											});
										} else {
											return res.jsonp(req.soajs.buildResponse(null, tokenRecord.token));
										}
									});
								});
							});
						});
					});
				});
			});
		},
		"changePassword": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			//check if user account is there
			libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['uId'], function (err, userId) {
				if (err) {
					libProduct.model.closeConnection(req.soajs);
					return res.jsonp(req.soajs.buildResponse({"code": 411, "msg": req.soajs.config.errors[411]}));
				}
				var combo = {
					collection: userCollectionName,
					condition: {'_id': userId}
				};
				libProduct.model.findEntry(req.soajs, combo, function (err, userRecord) {
					if (err || !userRecord) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 405, "msg": req.soajs.config.errors[405]}));
					}
					
					utils.comparePwd(req.soajs.servicesConfig.urac, req.soajs.inputmaskData['oldPassword'], userRecord.password, req.soajs.config, function (err, response) {
						if (err || !response) {
							req.soajs.log.error(err);
							libProduct.model.closeConnection(req.soajs);
							return res.jsonp(req.soajs.buildResponse({
								"code": 409,
								"msg": req.soajs.config.errors[409]
							}));
						}
						else {
							//hash new password, update record and save
							userRecord.password = utils.encryptPwd(req.soajs.servicesConfig.urac, req.soajs.inputmaskData['password'], req.soajs.config);
							var combo = {
								collection: userCollectionName,
								record: userRecord
							};
							libProduct.model.saveEntry(req.soajs, combo, function (err) {
								libProduct.model.closeConnection(req.soajs);
								var data = {config: req.soajs.config, error: err, code: 407};
								checkIfError(req, res, data, false, function () {
									return res.jsonp(req.soajs.buildResponse(null, true));
								});
							});
						}
					});
				});
			});
		},
		"getUser": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			var combo = {
				collection: userCollectionName,
				condition: {
					'username': req.soajs.inputmaskData['username'],
					'status': 'active'
				}
			};
			libProduct.model.findEntry(req.soajs, combo, function (err, record) {
				libProduct.model.closeConnection(req.soajs);
				var data = {config: req.soajs.config, error: err, code: 405};
				checkIfError(req, res, data, false, function () {
					if (!record) {
						req.soajs.log.error('Record not found for username: ' + req.soajs.inputmaskData['username']);
						return res.jsonp(req.soajs.buildResponse({"code": 405, "msg": req.soajs.config.errors[405]}));
					}
					delete record.password;
					return res.jsonp(req.soajs.buildResponse(null, record));
				});
			});
		}
	},
	"admin": {
		"listAll": function (req, res) {
			libProduct.model.initConnection(req.soajs);
			var combo = {
				collection: userCollectionName,
				condition: {},
				fields: {'password': 0}
			};
			libProduct.model.findEntries(req.soajs, combo, function (err, userRecords) {
				var data = {config: req.soajs.config, error: err, code: 405};
				checkIfError(req, res, data, false, function () {
					var combo = {
						collection: groupsCollectionName,
						condition: {}
					};
					libProduct.model.findEntries(req.soajs, combo, function (err, grpRecords) {
						libProduct.model.closeConnection(req.soajs);
						data.code = 415;
						data.error = err;
						checkIfError(req, res, data, false, function () {
							return res.jsonp(req.soajs.buildResponse(null, {
								'users': userRecords,
								'groups': grpRecords
							}));
						});
					});
				});
			});
		},
		"user": {
			"countUsers": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				var condition = {};
				if (req.soajs.inputmaskData['tId']) {
					condition = {"tenant.id": req.soajs.inputmaskData['tId']};
				}
				if (req.soajs.inputmaskData['keywords']) {
					var rePattern = new RegExp(req.soajs.inputmaskData['keywords'], 'i');
					condition['$or'] = [
						{"email": rePattern},
						{"username": rePattern},
						{"firstName": rePattern},
						{"lastName": rePattern}
					];
				}
				var combo = {
					collection: userCollectionName,
					condition: condition
				};
				libProduct.model.countEntries(req.soajs, combo, function (err, countUsers) {
					libProduct.model.closeConnection(req.soajs);
					var data = {config: req.soajs.config, error: err, code: 600};
					checkIfError(req, res, data, false, function () {
						// if (countUsers === 0) {
						// 	return res.jsonp(req.soajs.buildResponse(null, 0));
						// }
						
						return res.jsonp(req.soajs.buildResponse(null, {count: countUsers}));
					});
				});
			},
			"listUsers": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				var condition = {};
				if (req.soajs.inputmaskData['tId']) {
					condition = {"tenant.id": req.soajs.inputmaskData['tId']};
				}
				var pagination = {};
				if (req.soajs.inputmaskData.limit) {
					pagination['skip'] = req.soajs.inputmaskData.start;
					pagination['limit'] = req.soajs.inputmaskData.limit;
					pagination.sort = {};
				}
				
				if (req.soajs.inputmaskData['keywords']) {
					var rePattern = new RegExp(req.soajs.inputmaskData['keywords'], 'i');
					condition['$or'] = [
						{"email": rePattern},
						{"username": rePattern},
						{"firstName": rePattern},
						{"lastName": rePattern}
					];
				}
				var fields = {'password': 0};
				var combo = {
					collection: userCollectionName,
					condition: condition,
					fields: fields,
					options: pagination
				};
				libProduct.model.findEntries(req.soajs, combo, function (err, userRecords) {
					libProduct.model.closeConnection(req.soajs);
					var data = {config: req.soajs.config, error: err || !userRecords, code: 600};
					checkIfError(req, res, data, false, function () {
						//if no records return empty array
						if (userRecords.length === 0) {
							return res.jsonp(req.soajs.buildResponse(null, []));
						}
						
						return res.jsonp(req.soajs.buildResponse(null, userRecords));
					});
				});
			},
			"getUser": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				
				libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['uId'], function (err, userId) {
					if (err) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 411, "msg": req.soajs.config.errors[411]}));
					}
					var combo = {
						collection: userCollectionName,
						condition: {'_id': userId}
					};
					libProduct.model.findEntry(req.soajs, combo, function (err, userRecord) {
						libProduct.model.closeConnection(req.soajs);
						var data = {config: req.soajs.config, error: err || !userRecord, code: 405};
						checkIfError(req, res, data, false, function () {
							delete userRecord.password;
							return res.jsonp(req.soajs.buildResponse(null, userRecord));
						});
					});
				});
			},
			"addUser": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				var condition = {'username': req.soajs.inputmaskData['username']};
				utils.getTenantServiceConfig(req);
				var combo = {
					collection: userCollectionName,
					condition: condition
				};
				libProduct.model.findEntry(req.soajs, combo, function (err, record) {
					var data = {config: req.soajs.config, error: err, code: 414};
					checkIfError(req, res, data, true, function () {
						//user exits
						//if(record && record.tenant.id === req.soajs.inputmaskData['tId'].toString()) {
						if (record) {
							libProduct.model.closeConnection(req.soajs);
							return res.jsonp(req.soajs.buildResponse({
								"code": 402,
								"msg": req.soajs.config.errors[402]
							}));
						}
						
						//hash the password
						var pwd = utils.getRandomString(12, req.soajs.config);
						if (req.soajs.inputmaskData['status'] === 'active' && req.soajs.inputmaskData['password'] && req.soajs.inputmaskData['password'] !== '') {
							pwd = req.soajs.inputmaskData['password'];
						}
						pwd = utils.encryptPwd(req.soajs.servicesConfig.urac, pwd, req.soajs.config);
						
						var userRecord = {
							"username": req.soajs.inputmaskData['username'],
							"password": pwd,
							"firstName": req.soajs.inputmaskData['firstName'],
							"lastName": req.soajs.inputmaskData['lastName'],
							"email": req.soajs.inputmaskData['email'],
							'status': req.soajs.inputmaskData['status'],
							"config": {},
							'ts': new Date().getTime()
						};
						if (req.soajs.inputmaskData['profile']) {
							userRecord.profile = req.soajs.inputmaskData['profile'];
						}
						if (req.soajs.inputmaskData['groups']) {
							userRecord.groups = req.soajs.inputmaskData['groups'];
						}
						if (req.soajs.inputmaskData['tId']) {
							libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['tId'], function (e, tId) {
								if (e) {
									req.soajs.log.error(e);
									libProduct.model.closeConnection(req.soajs);
									return res.jsonp(req.soajs.buildResponse({
										"code": 611,
										"msg": req.soajs.config.errors[611]
									}));
								}
								//req.soajs.inputmaskData['tId'] = tId;
								userRecord.tenant = {
									"id": tId.toString(),
									"code": req.soajs.inputmaskData['tCode']
								};
								doInsert();
							});
						}
						else {
							doInsert();
						}
						
						function doInsert() {
							var combo = {
								collection: userCollectionName,
								record: userRecord
							};
							//add record in db
							libProduct.model.insertEntry(req.soajs, combo, function (err, userDbRecord) {
								data.code = 403;
								data.error = err;
								var objReturn = {
									id: userDbRecord[0]._id.toString()
								};
								checkIfError(req, res, data, true, function () {
									if (userDbRecord[0].status !== 'pendingNew') {
										libProduct.model.closeConnection(req.soajs);
										return res.jsonp(req.soajs.buildResponse(null, objReturn));
									}
									
									//create notification email
									var tokenRecord = {
										'userId': userDbRecord[0]._id.toString(),
										'token': uuid.v4(),
										'expires': new Date(new Date().getTime() + req.soajs.servicesConfig.urac.tokenExpiryTTL),
										'status': 'active',
										'ts': new Date().getTime(),
										'service': 'addUser',
										'username': userDbRecord[0].username
									};
									var combo = {
										collection: tokenCollectionName,
										record: tokenRecord
									};
									libProduct.model.insertEntry(req.soajs, combo, function (err) {
										libProduct.model.closeConnection(req.soajs);
										data.error = err;
										objReturn.token = tokenRecord.token;
										checkIfError(req, res, data, false, function () {
											if (req.soajs.servicesConfig.mail && req.soajs.servicesConfig.urac.mail && req.soajs.servicesConfig.urac.mail.addUser) {
												
												var data = userRecord;
												data.link = {
													addUser: utils.addTokenToLink(req.soajs.servicesConfig.urac.link.addUser, tokenRecord.token)
												};
												
												utils.sendMail('addUser', req, data, function (error) {
													return res.jsonp(req.soajs.buildResponse(null, objReturn));
												});
											}
											else {
												req.soajs.log.info('No Mail sent on add User');
												return res.jsonp(req.soajs.buildResponse(null, objReturn));
											}
										});
									});
								});
							});
						}
					});
				});
			},
			"editUser": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				utils.updateUserRecord(req, libProduct, true, function (error) {
					if (error) {
						return res.jsonp(req.soajs.buildResponse({"code": error.code, "msg": error.msg}));
					}
					return res.jsonp(req.soajs.buildResponse(null, true));
				});
			},
			"editConfig": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				function updateUserAclRecord(req, cb) {
					//check if user account is there
					libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['uId'], function (err, userId) {
						if (err) {
							libProduct.model.closeConnection(req.soajs);
							return cb({"code": 411, "msg": req.soajs.config.errors[411]});
						}
						
						var combo = {
							collection: userCollectionName,
							condition: {'_id': userId}
						};
						libProduct.model.findEntry(req.soajs, combo, function (err, userRecord) {
							if (err || !userRecord) {
								libProduct.model.closeConnection(req.soajs);
								return cb({"code": 405, "msg": req.soajs.config.errors[405]});
							}
							// cannot change config of the locked user
							if (userRecord.locked) {
								return cb({"code": 500, "msg": req.soajs.config.errors[500]});
							}
							
							var configObj = req.soajs.inputmaskData['config'];
							if (typeof(userRecord.config) !== 'object') {
								userRecord.config = {};
							}
							if (configObj.packages) {
								userRecord.config.packages = configObj.packages;
							}
							var combo = {
								collection: userCollectionName,
								record: userRecord
							};
							//update record in the database
							libProduct.model.saveEntry(req.soajs, combo, function (err) {
								libProduct.model.closeConnection(req.soajs);
								if (err) {
									return cb({"code": 407, "msg": req.soajs.config.errors[407]});
								}
								return cb(null, true);
							});
							
						});
					});
				}
				
				updateUserAclRecord(req, function (error) {
					if (error) {
						return res.jsonp(req.soajs.buildResponse({"code": error.code, "msg": error.msg}));
					}
					return res.jsonp(req.soajs.buildResponse(null, true));
				});
			},
			"changeStatus": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				//check if user account is there
				libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['uId'], function (err, userId) {
					if (err) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 411, "msg": req.soajs.config.errors[411]}));
					}
					
					utils.getTenantServiceConfig(req);
					//get user database record
					var criteria = {
						'_id': userId,
						'locked': {$ne: true}
					};
					var combo = {
						collection: userCollectionName,
						condition: criteria
					};
					/* $ne selects the documents where the value of the field is not equal (i.e. !=) to the specified value.
					 * This includes documents that do not contain the field. */
					libProduct.model.findEntry(req.soajs, combo, function (err, userRecord) {
						var data = {config: req.soajs.config, error: err || !userRecord, code: 405};
						checkIfError(req, res, data, true, function () {
							
							//update record entries
							userRecord.status = req.soajs.inputmaskData['status'];
							var combo1 = {
								collection: userCollectionName,
								record: userRecord
							};
							//update record in the database
							libProduct.model.saveEntry(req.soajs, combo1, function (err) {
								libProduct.model.closeConnection(req.soajs);
								data.code = 407;
								data.error = err;
								checkIfError(req, res, data, false, function () {
									if (req.soajs.servicesConfig.mail && req.soajs.servicesConfig.urac.mail && req.soajs.servicesConfig.urac.mail.changeUserStatus) {
										utils.sendMail('changeUserStatus', req, userRecord, function (error) {
											return res.jsonp(req.soajs.buildResponse(null, true));
										});
									}
									else {
										return res.jsonp(req.soajs.buildResponse(null, true));
									}
								});
							});
						});
					});
				});
			}
		},
		"group": {
			"list": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				
				var condition = {};
				if (req.soajs.inputmaskData['tId']) {
					condition = {"tenant.id": req.soajs.inputmaskData['tId']};
				}
				var combo = {
					collection: groupsCollectionName,
					condition: condition
				};
				libProduct.model.findEntries(req.soajs, combo, function (err, grpsRecords) {
					var data = {config: req.soajs.config, error: err || !grpsRecords, code: 415};
					checkIfError(req, res, data, false, function () {
						
						libProduct.model.closeConnection(req.soajs);
						//if no records return empty array
						if (grpsRecords.length === 0) {
							return res.jsonp(req.soajs.buildResponse(null, []));
						}
						
						return res.jsonp(req.soajs.buildResponse(null, grpsRecords));
					});
				});
				
			},
			"add": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				var grpRecord = {
					"code": req.soajs.inputmaskData['code'],
					"name": req.soajs.inputmaskData['name'],
					"description": req.soajs.inputmaskData['description']
				};
				
				var condition = {
					'code': grpRecord.code
				};
				if (req.soajs.inputmaskData['tId']) {
					libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['tId'], function (err, id) {
						if (err) {
							libProduct.model.closeConnection(req.soajs);
							return res.jsonp(req.soajs.buildResponse({
								"code": 611,
								"msg": req.soajs.config.errors[611]
							}));
						}
						req.soajs.inputmaskData['tId'] = id;
						
						grpRecord.tenant = {
							"id": req.soajs.inputmaskData['tId'].toString(),
							"code": req.soajs.inputmaskData['tCode']
						};
						condition['tenant.id'] = grpRecord.tenant.id;
						addGroup();
					});
				}
				else {
					addGroup();
				}
				
				function addGroup() {
					var combo = {
						collection: groupsCollectionName,
						condition: condition
					};
					libProduct.model.countEntries(req.soajs, combo, function (error, count) {
						var data = {config: req.soajs.config, error: error, code: 600};
						checkIfError(req, res, data, true, function () {
							if (count > 0) {
								libProduct.model.closeConnection(req.soajs);
								return res.jsonp(req.soajs.buildResponse({
									"code": 421,
									"msg": req.soajs.config.errors[421]
								}));
							}
							var combo = {
								collection: groupsCollectionName,
								record: grpRecord
							};
							libProduct.model.insertEntry(req.soajs, combo, function (err, result) {
								data.code = 416;
								data.error = err;
								checkIfError(req, res, data, false, function () {
									return res.jsonp(req.soajs.buildResponse(null, true));
								});
							});
							
						});
					});
				}
				
			},
			"edit": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				//check if grp record is there
				var groupId;
				
				libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['gId'], function (err, id) {
					if (err) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 417, "msg": req.soajs.config.errors[417]}));
					}
					groupId = id;
					var s = {
						'$set': {
							'description': req.soajs.inputmaskData.description,
							'name': req.soajs.inputmaskData.name
						}
					};
					
					var combo = {
						collection: groupsCollectionName,
						condition: {'_id': groupId},
						updatedFields: s,
						extraOptions: {
							'upsert': false,
							'safe': true
						}
					};
					
					libProduct.model.updateEntry(req.soajs, combo, function (error) {
						libProduct.model.closeConnection(req.soajs);
						var data = {config: req.soajs.config, error: error, code: 418};
						checkIfError(req, res, data, false, function () {
							return res.jsonp(req.soajs.buildResponse(null, true));
						});
					});
					
				});
				
			},
			"delete": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				var groupId;
				
				libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['gId'], function (err, id) {
					if (err) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 417, "msg": req.soajs.config.errors[417]}));
					}
					groupId = id;
					var combo = {
						collection: groupsCollectionName,
						condition: {'_id': groupId}
					};
					libProduct.model.findEntry(req.soajs, combo, function (error, record) {
						var data = {config: req.soajs.config, error: error || !record, code: 415};
						checkIfError(req, res, data, true, function () {
							if (record.locked && record.locked === true) {
								//return error msg that this record is locked
								libProduct.model.closeConnection(req.soajs);
								return res.jsonp(req.soajs.buildResponse({
									"code": 500,
									"msg": req.soajs.config.errors[500]
								}));
							}
							var grpCode = record.code;
							var combo = {
								collection: groupsCollectionName,
								condition: {
									'_id': groupId,
									'locked': {$ne: true}
								}
							};
							libProduct.model.removeEntry(req.soajs, combo, function (error) {
								data.code = 419;
								data.error = error;
								checkIfError(req, res, data, true, function () {
									var userCond = {
										"groups": grpCode
									};
									if (record.tenant && record.tenant.id) {
										userCond["tenant.id"] = record.tenant.id;
									}
									var combo = {
										collection: userCollectionName,
										condition: userCond,
										updatedFields: {$pull: {groups: grpCode}},
										extraOptions: {multi: true}
									};
									
									libProduct.model.updateEntry(req.soajs, combo, function (err) {
										libProduct.model.closeConnection(req.soajs);
										data.code = 600;
										data.error = err;
										checkIfError(req, res, data, false, function () {
											return res.jsonp(req.soajs.buildResponse(null, true));
										});
									});
								});
							});
						});
					});
				});
				
			},
			"addUsers": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				// delete from all users
				var grp = req.soajs.inputmaskData['code'];
				var grpCondition = {
					'groups': grp
				};
				if (req.soajs.inputmaskData['tId']) {
					grpCondition['tenant.id'] = req.soajs.inputmaskData['tId'];
				}
				
				var combo = {
					collection: userCollectionName,
					condition: grpCondition,
					updatedFields: {
						$pull: {groups: grp}
					},
					extraOptions: {
						multi: true
					}
				};
				libProduct.model.updateEntry(req.soajs, combo, function (err) {
					var data = {config: req.soajs.config, error: err, code: 600};
					checkIfError(req, res, data, true, function () {
						
						var users = req.soajs.inputmaskData['users'];
						if (users && users.length > 0) {
							var conditionUsers = {
								'username': {$in: users}
							};
							if (req.soajs.inputmaskData['tId']) {
								conditionUsers['tenant.id'] = req.soajs.inputmaskData['tId'];
							}
							var combo = {
								collection: userCollectionName,
								condition: conditionUsers,
								updatedFields: {
									$push: {groups: grp}
								},
								extraOptions: {
									multi: true
								}
							};
							
							libProduct.model.updateEntry(req.soajs, combo, function (err) {
								libProduct.model.closeConnection(req.soajs);
								data.error = err;
								checkIfError(req, res, data, false, function () {
									return res.jsonp(req.soajs.buildResponse(null, true));
								});
							});
						}
						else {
							libProduct.model.closeConnection(req.soajs);
							return res.jsonp(req.soajs.buildResponse(null, true));
						}
					});
				});
				
			}
		},
		"tokens": {
			"list": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				
				var condition = {};
				var combo = {
					collection: tokenCollectionName,
					condition: condition
				};

				var returnObj = {
					records: []
				};

				function getRecords() {
					var pagination = {};
					// add pagination
					pagination['skip'] = req.soajs.inputmaskData.start;
					pagination['limit'] = req.soajs.inputmaskData.limit;
					combo.options = pagination;

					libProduct.model.findEntries(req.soajs, combo, function (err, records) {
						var data = {error: err || !records, code: 425};
						checkIfError(req, res, data, false, function () {
							libProduct.model.closeConnection(req.soajs);
							returnObj.records = records;
							return res.jsonp(req.soajs.buildResponse(null, returnObj));
						});
					});
				}

				if (req.soajs.inputmaskData.start === 0) {
					libProduct.model.countEntries(req.soajs, combo, function (err, count) {
						var data = {error: err, code: 600};
						checkIfError(req, res, data, false, function () {
							//if no records return empty array
							if (count === 0) {
								returnObj.totalCount = 0;
								return res.jsonp(req.soajs.buildResponse(null, returnObj));
							}
							returnObj.totalCount = count;
							getRecords();
						});
					});
				}
				else {
					getRecords();
				}
				
			},
			"delete": function (req, res) {
				libProduct.model.initConnection(req.soajs);
				
				libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['tokenId'], function (err, tokenId) {
					if (err) {
						libProduct.model.closeConnection(req.soajs);
						return res.jsonp(req.soajs.buildResponse({"code": 426, "msg": req.soajs.config.errors[426]}));
					}
					var combo = {
						collection: tokenCollectionName,
						condition: {'_id': tokenId}
					};
					libProduct.model.findEntry(req.soajs, combo, function (error, record) {
						var data = {config: req.soajs.config, error: error || !record, code: 425};
						checkIfError(req, res, data, true, function () {
							
							libProduct.model.removeEntry(req.soajs, combo, function (error) {
								libProduct.model.closeConnection(req.soajs);
								data.code = 600;
								data.error = error;
								checkIfError(req, res, data, false, function () {
									return res.jsonp(req.soajs.buildResponse(null, true));
								});
							});
						});
					});
				});
				
			}
		}
	}
};

//module.exports = libProduct;

module.exports = {
	"init": function (modelName, cb) {
		var modelPath = __dirname + "/../model/" + modelName + ".js";
		return requireModel(modelPath, cb);
		
		/**
		 * checks if model file exists, requires it and returns it.
		 * @param filePath
		 * @param cb
		 */
		function requireModel(filePath, cb) {
			//check if file exist. if not return error
			fs.exists(filePath, function (exists) {
				if (!exists) {
					return cb(new Error("Requested Model Not Found!"));
				}
				
				libProduct.model = require(filePath);
				return cb(null, libProduct);
			});
		}
	}
};