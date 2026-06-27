function update_active_users(r) {
    var dict = ngx.shared.broadcast_zone;
    var clientUsername = r.headersIn['X-DDO-Username'];
    var now = Math.floor(Date.now() / 1000);
    
    var usersStr = dict.get("active_users");
    var users = {};
    if (usersStr) {
        try {
            users = JSON.parse(usersStr);
        } catch (e) {
            users = {};
        }
    }
    
    if (clientUsername) {
        users[clientUsername] = now;
    }
    
    // Clean up old entries (inactive for > 10 seconds)
    var cleaned = {};
    var count = 0;
    for (var key in users) {
        if (users.hasOwnProperty(key)) {
            if (now - users[key] <= 10) {
                cleaned[key] = users[key];
                count++;
            }
        }
    }
    
    dict.set("active_users", JSON.stringify(cleaned));
    
    // Add header to response
    var activeCount = count > 0 ? count : 1;
    r.headersOut['X-DDO-Active-Count'] = activeCount.toString();
}

function post_message(r) {
    update_active_users(r);
    var dict = ngx.shared.broadcast_zone;
    try {
        var body = JSON.parse(r.requestBody);
        var msgId = body.id || Date.now().toString();
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
    update_active_users(r);
    var dict = ngx.shared.broadcast_zone;
    var sinceId = r.headersIn['X-DDO-Since-Id'];
    
    var historyStr = dict.get("history");
    var history = [];
    if (historyStr) {
        try {
            history = JSON.parse(historyStr);
        } catch (e) {
            history = [];
        }
    }
    
    var newMessages = [];
    if (sinceId) {
        var foundIndex = -1;
        for (var i = 0; i < history.length; i++) {
            if (history[i].id === sinceId) {
                foundIndex = i;
                break;
            }
        }
        if (foundIndex !== -1) {
            newMessages = history.slice(foundIndex + 1);
        } else {
            newMessages = history;
        }
    } else {
        newMessages = [];
    }
    
    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, JSON.stringify(newMessages));
}

function get_history(r) {
    update_active_users(r);
    var dict = ngx.shared.broadcast_zone;
    var val = dict.get("history");
    r.headersOut['Content-Type'] = 'application/json';
    r.return(200, val || "[]");
}

function post_model(r) {
    update_active_users(r);
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
    update_active_users(r);
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

function handle_queue(r) {
    update_active_users(r);
    var dict = ngx.shared.broadcast_zone;
    r.headersOut['Content-Type'] = 'application/json';
    
    // Get and sanitize current queue
    var queueStr = dict.get("queue");
    var queue = [];
    if (queueStr) {
        try {
            queue = JSON.parse(queueStr);
        } catch (e) {
            queue = [];
        }
    }
    
    var nowEpoch = Math.floor(Date.now() / 1000);
    var newQueue = [];
    var hasChanges = false;
    
    // Check timeout of running job (120 seconds limit)
    for (var i = 0; i < queue.length; i++) {
        var job = queue[i];
        if (job.status === "running") {
            if (nowEpoch - job.timestamp > 120) {
                hasChanges = true;
                continue;
            }
        }
        newQueue.push(job);
    }
    
    if (hasChanges) {
        queue = newQueue;
        if (queue.length > 0 && queue[0].status === "waiting") {
            queue[0].status = "running";
            queue[0].timestamp = nowEpoch;
        }
        dict.set("queue", JSON.stringify(queue));
    }
    
    if (r.method === 'GET') {
        r.return(200, JSON.stringify(queue));
    } 
    else if (r.method === 'POST') {
        try {
            var body = JSON.parse(r.requestBody);
            var action = body.action;
            var id = body.id;
            var username = body.username;
            
            if (action === 'join') {
                var exists = false;
                for (var j = 0; j < queue.length; j++) {
                    if (queue[j].id === id) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    var newJob = {
                        id: id,
                        username: username,
                        timestamp: nowEpoch,
                        status: 'waiting'
                    };
                    if (queue.length === 0) {
                        newJob.status = 'running';
                    }
                    queue.push(newJob);
                    dict.set("queue", JSON.stringify(queue));
                }
                r.return(200, JSON.stringify({ status: "success" }));
            } 
            else if (action === 'cancel') {
                var newQ = [];
                var wasRunning = false;
                for (var k = 0; k < queue.length; k++) {
                    if (queue[k].id === id) {
                        if (queue[k].status === 'running') {
                            wasRunning = true;
                        }
                        continue;
                    }
                    newQ.push(queue[k]);
                }
                queue = newQ;
                if (wasRunning && queue.length > 0) {
                    queue[0].status = 'running';
                    queue[0].timestamp = nowEpoch;
                }
                dict.set("queue", JSON.stringify(queue));
                r.return(200, JSON.stringify({ status: "success" }));
            } 
            else if (action === 'complete') {
                var newQ2 = [];
                for (var m = 0; m < queue.length; m++) {
                    if (queue[m].id === id) {
                        continue;
                    }
                    newQ2.push(queue[m]);
                }
                queue = newQ2;
                if (queue.length > 0) {
                    queue[0].status = 'running';
                    queue[0].timestamp = nowEpoch;
                }
                dict.set("queue", JSON.stringify(queue));
                r.return(200, JSON.stringify({ status: "success" }));
            } 
            else {
                r.return(400, "Invalid action");
            }
        } catch (e) {
            r.return(400, "Invalid JSON body");
        }
    } 
    else {
        r.return(405, "Method Not Allowed");
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

export default { post_message, get_message, get_history, handle_model, handle_queue, auth_check };
