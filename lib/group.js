'use strict';
var fs = require("fs");
var uuid = require('uuid');
var userCollectionName = "users";
var groupsCollectionName = "groups";

var utils = require("./utils.js");

var libProduct = {
	"model": null,
	
	/**
	 * List all groups
	 * @param {Request Object} req
	 * @param {Callback Function} cb
	 */
	"list": function (req, cb) {
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
			var data = {
				config: req.soajs.config, error: err || !grpsRecords, code: 415,
				model: libProduct.model
			};
			utils.checkIfError(req, cb, data, false, function () {
				libProduct.model.closeConnection(req.soajs);
				//if no records return empty array
				if (grpsRecords.length === 0) {
					return cb(null, []);
				}
				
				return cb(null, grpsRecords);
			});
		});
		
	},
	
	/**
	 * Add a new group
	 * @param {Request Object} req
	 * @param {Callback Function} cb
	 */
	"add": function (req, cb) {
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
					return cb({"code": 611, "msg": req.soajs.config.errors[611]});
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
				var data = {
					config: req.soajs.config, error: error, code: 400,
					model: libProduct.model
				};
				utils.checkIfError(req, cb, data, true, function () {
					if (count > 0) {
						libProduct.model.closeConnection(req.soajs);
						return cb({"code": 421, "msg": req.soajs.config.errors[421]});
					}
					var combo = {
						collection: groupsCollectionName,
						record: grpRecord
					};
					libProduct.model.insertEntry(req.soajs, combo, function (err, result) {
						data.code = 416;
						data.error = err;
						utils.checkIfError(req, cb, data, false, function () {
							return cb(null, true);
						});
					});
					
				});
			});
		}
		
	},
	
	/**
	 * Edit a group
	 * @param {Request Object} req
	 * @param {Callback Function} cb
	 */
	"edit": function (req, cb) {
		libProduct.model.initConnection(req.soajs);
		//check if grp record is there
		var groupId;
		
		libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['gId'], function (err, id) {
			if (err) {
				libProduct.model.closeConnection(req.soajs);
				return cb({
					"code": 417,
					"msg": req.soajs.config.errors[417]
				});
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
				var data = {
					config: req.soajs.config, error: error, code: 418,
					model: libProduct.model
				};
				utils.checkIfError(req, cb, data, false, function () {
					return cb(null, true);
				});
			});
			
		});
		
	},
	
	/**
	 * Delete a group record
	 * @param {Request Object} req
	 * @param {Callback Function} cb
	 */
	"delete": function (req, cb) {
		libProduct.model.initConnection(req.soajs);
		var groupId;
		
		libProduct.model.validateId(req.soajs, req.soajs.inputmaskData['gId'], function (err, id) {
			if (err) {
				libProduct.model.closeConnection(req.soajs);
				return cb({"code": 417, "msg": req.soajs.config.errors[417]});
			}
			groupId = id;
			var combo = {
				collection: groupsCollectionName,
				condition: {'_id': groupId}
			};
			libProduct.model.findEntry(req.soajs, combo, function (error, record) {
				var data = {
					config: req.soajs.config, error: error || !record, code: 415,
					model: libProduct.model
				};
				utils.checkIfError(req, cb, data, true, function () {
					if (record.locked && record.locked === true) {
						//return error msg that this record is locked
						libProduct.model.closeConnection(req.soajs);
						return cb({"code": 500, "msg": req.soajs.config.errors[500]});
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
						utils.checkIfError(req, cb, data, true, function () {
							var userCond = {
								"groups": grpCode
							};
							if (record.tenant && record.tenant.id) {
								userCond["tenant.id"] = record.tenant.id;
							}
							var combo = {
								collection: userCollectionName,
								condition: userCond,
								updatedFields: {"$pull": {groups: grpCode}},
								extraOptions: {multi: true}
							};
							
							libProduct.model.updateEntry(req.soajs, combo, function (err) {
								libProduct.model.closeConnection(req.soajs);
								data.code = 400;
								data.error = err;
								utils.checkIfError(req, cb, data, false, function () {
									return cb(null, true);
								});
							});
						});
					});
				});
			});
		});
		
	},
	
	/**
	 * Assign users to a group
	 * @param {Request Object} req
	 * @param {Callback Function} cb
	 */
	"addUsers": function (req, cb) {
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
				"$pull": {groups: grp}
			},
			extraOptions: {
				multi: true
			}
		};
		libProduct.model.updateEntry(req.soajs, combo, function (err) {
			var data = {
				config: req.soajs.config, error: err, code: 400,
				model: libProduct.model
			};
			utils.checkIfError(req, cb, data, true, function () {
				
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
						utils.checkIfError(req, cb, data, false, function () {
							return cb(null, true);
						});
					});
				}
				else {
					libProduct.model.closeConnection(req.soajs);
					return cb(null, true);
				}
			});
		});
		
	}
	
};

module.exports = libProduct;