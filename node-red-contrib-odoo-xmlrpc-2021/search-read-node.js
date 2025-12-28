function isDefinedValue(v){
  return !(v == null || typeof v === 'undefined');
}

function isUInt(v){
  return typeof v === 'number' && Math.floor(v) === v && v >= 0;
}

module.exports = function (RED) {
    var handle_error = function(err, node, msg, fromOdoo=false) {
        var short_message = err.message.length > node.errorlength ? err.message.substring(err.message.length - node.errorlength) : err.message;
        node.log(err.body);
        node.status({fill: "red", shape: "dot", text: fromOdoo ? "Odoo server error" : short_message});
        node.error(short_message, msg);
    };

    function OdooXMLRPCSearchReadNode(config) {
        RED.nodes.createNode(this, config);
        this.host = RED.nodes.getNode(config.host);
        this.errorlength = this.host.errorlength;
        var node = this;

        node.on('input', function (msg) {
            node.status({});
            this.host.connect(function(err, odoo_inst) {
                if (err) {
                    return handle_error(err, node, msg);
                }

                var inParams;
                if (msg.filters){
                  if (!Array.isArray(msg.filters)){
                    return handle_error(new Error('When filters is provided, it must be an array'), node, msg);
                  }
                  inParams = msg.filters;
                } else {
                  inParams = [];
                  inParams.push([]);
                }
                var params = [];
                params.push(inParams); // domain

                var fields = msg.fields;
                if (isDefinedValue(fields)){
                  if (!Array.isArray(fields)){
                    return handle_error(new Error('When fields is provided, it must be an array'), node, msg);
                  } else {
                    inParams.push(fields);
                  }
                } else {
                  return handle_error(new Error('fields required!'), node, msg);
                }
                 
                var offset = msg.offset;
                if (isDefinedValue(offset)){
                  if (!isUInt(offset)){
                    return handle_error(new Error('When offset is provided, it must be a positive integer number'), node, msg);
                  } else {
                    inParams.push(offset);
                  }
                }
                var limit = msg.limit;
                if (isDefinedValue(limit)){
                  if (!isUInt(limit)){
                    return handle_error(new Error('When limit is provided, it must be a positive integer number'), node, msg);
                  } else {
                    inParams.push(limit);
                  }
                }
                
                var order = msg.order;
                if (isDefinedValue(order)){
                  if (typeof order !== 'string'){
                    return handle_error(new Error('When order is provided, it must be a string'), node, msg);
                  } else {
                    inParams.push(order);
                  }
                }
                //node.log('Search-reading for model "' + config.model + '"...');
                // domain=None, fields=None, offset=0, limit=None, order=None
                odoo_inst.execute_kw(config.model, 'search_read', params, function (err, value) {
                    if (err) {
                        return handle_error(err, node, msg, true);
                    }

                    msg.payload = value;
                    node.send(msg);
                });
            });
        });
    }
    RED.nodes.registerType("odoo-search-read", OdooXMLRPCSearchReadNode);
};
