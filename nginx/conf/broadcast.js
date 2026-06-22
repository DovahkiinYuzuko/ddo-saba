function post_message(r) {
    var dict = ngx.shared.broadcast_zone;
    try {
        var body = JSON.parse(r.requestBody);
        var msgId = Date.now().toString();
        var msgData = {
            id: msgId,
            sender: body.sender || 'unknown',
            broadcaster: body.broadcaster || '',
            role: body.role || 'user',
            content: body.content || '',
            timestamp: new Date().toISOString()
        };
        dict.set("latest", JSON.stringify(msgData));

        // Save to message history cache (limit to 100 items)
        var historyStr = dict.get("history");
        var history = [];
        if (historyStr) {
            try {
                history = JSON.parse(historyStr);
            } catch (e) {
                history = [];
            }
        }
        history.push(msgData);
        if (history.length > 100) {
            history = history.slice(history.length - 100);
        }
        dict.set("history", JSON.stringify(history));

        r.return(200, JSON.stringify({ status: "success", id: msgId }));
    } catch (e) {
        r.return(400, "Invalid JSON body");
    }
}

function get_message(r) {
    var dict = ngx.shared.broadcast_zone;
    var val = dict.get("latest");
    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, val || JSON.stringify({}));
}

function get_history(r) {
    var dict = ngx.shared.broadcast_zone;
    var val = dict.get("history");
    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, val || "[]");
}

function post_model(r) {
    var dict = ngx.shared.broadcast_zone;
    try {
        var body = JSON.parse(r.requestBody);
        if (!body.timestamp) {
            body.timestamp = Date.now();
        }
        dict.set("model", JSON.stringify(body));
        r.return(200, JSON.stringify({ status: "success" }));
    } catch (e) {
        r.return(400, "Invalid JSON body");
    }
}

function get_model(r) {
    var dict = ngx.shared.broadcast_zone;
    var val = dict.get("model");
    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, val || JSON.stringify({}));
}

function handle_model(r) {
    if (r.method === 'POST') {
        post_model(r);
    } else {
        get_model(r);
    }
}

function auth_check(r) {
    var expectedToken = process.env.DDO_SABA_TOKEN;
    
    // If no token is set by host, bypass authentication
    if (!expectedToken || expectedToken === "") {
        r.return(200);
        return;
    }
    
    var clientToken = r.headersIn['X-DDO-Token'];
    if (clientToken === expectedToken) {
        r.return(200);
    } else {
        r.return(403, "Forbidden: Invalid Access Token");
    }
}

export default { post_message, get_message, get_history, handle_model, auth_check };
