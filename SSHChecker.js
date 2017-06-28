// public
var node_ssh = require("node-ssh");
var Checker = require("./Checker");

/**
 * Checks that we can SSH into a given host
 */
module.exports = SSHChecker;
SSHChecker.prototype = Object.create(Checker.prototype);
function SSHChecker(host) {
	Checker.call(this, host);

	this.numSSHFailures = 0;
	this.numHashFileAgeFailures = 0;
	this.numLowHashes = 0;
	this.numLowGPUs = 0;
};
SSHChecker.prototype.check = function() {

	var self = this;

	var ssh = new node_ssh();

	ssh.connect({
		host: self.host.ip,
		username: self.host.sshUserName,
		privateKey: self.host.sshKeyFile
	})
	.then(function() {

		self.numSSHFailures = 0;

		// this should be our ssh object (now with a valid connection)
		ssh.execCommand('echo $(($(date +%s) - $(date +%s -r "/var/run/ethos/miner_hashes.file")))')
		.then(function(result) {
			// console.log(result);

			var age = parseInt(result.stdout);

			if (age > 10) {
				console.log("SSHChecker ("+ self.host.name +"): Hash file is old: "+ age +" seconds");
				self.numHashFileAgeFailures++;
			} else {
				self.numHashFileAgeFailures = 0;
			}
		})
		.catch(function(error) {
			console.log("SSHChecker ("+ self.host.name +"): catch() called trying to obtain age of hash file");
			console.log(error);
			self.numHashFileAgeFailures++;
		});

		// ensure the miner speeds are acceptable
		ssh.execCommand('tail -n1 /var/run/ethos/miner_hashes.file')
		.then(function(result) {
			// console.log(result);

			var totalHashRate = 0;
			var hashRates = result.stdout.split(' ');
			var numHashesReported = 0;
			hashRates.forEach(function(hashRateStr, index, array) {
				var hashRate = parseFloat(hashRateStr);
				totalHashRate += hashRate;
				numHashesReported++;
			});

			if (totalHashRate < self.host.minHashRate) {
				console.log("SSHChecker ("+ self.host.name +"): hash rate is low ("+ totalHashRate +" < "+ self.host.minHashRate +")" );
				self.numLowHashes++;
			} else {
				self.numLowHashes = 0;
			}

			if (numHashesReported < self.host.numGPUs) {
				console.log("SSHChecker ("+ self.host.name +"): Too few GPUs! ("+ numHashesReported +" < "+ self.host.numGPUs +")" );
				self.numLowGPUs++;
			} else {
				self.numLowGPUs = 0;
			}
		})
		.catch(function(error) {
			console.log("SSHChecker ("+ self.host.name +"): catch() called trying to obtain hash rates");
			console.log(error);
			self.numHashFileAgeFailures++;
		});

	}).catch(function(error) {
		console.log("SSHChecker ("+ self.host.name +"): catch() called for SSH connection");
		console.log(error);

		self.numSSHFailures++;
	});

}
SSHChecker.prototype.getStatus = function() {
	var failure = (this.numSSHFailures > 2)
		|| (this.numHashFileAgeFailures > 2)
		|| (this.numLowHashes > 4)
		|| (this.numLowGPUs > 1);

	return (! failure);
}
SSHChecker.prototype.resetFailureCount = function() {
	this.numSSHFailures = 0;
	this.numHashFileAgeFailures = 0;
	this.numLowHashes = 0;
	this.numLowGPUs = 0;
}