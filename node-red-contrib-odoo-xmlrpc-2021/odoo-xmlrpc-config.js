module.exports = function (RED) {
    function OdooXMLRPCConfigNode(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.url = n.url;
        this.db = n.db;
        this.username = n.username;
        this.password = n.password;
        this.errorlength = n.errorlength;

        this.connect = function(callback) {
            var Odoo = require('odoo-xmlrpc');
            var odoo_inst = new Odoo({
                url: this.url,
                db: this.db,
                username: this.username,
                password: this.password,
            });
            odoo_inst.connect(function (err) {
                return callback(err, odoo_inst);
            });
        };
    }
    RED.nodes.registerType("odoo-config", OdooXMLRPCConfigNode);
}
