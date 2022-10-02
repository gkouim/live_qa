var http = require('http');
var ws = require('ws');
var fs = require('fs');
var url = require('url');


requestListener = function (req, res) {
    var q = url.parse(req.url, true);

    if (q.pathname == '/' || q.pathname == '/st/' || q.pathname == '/st') {
        filename = './st/index.html';
    } else {
        filename = "." + q.pathname;
    }

    console.log('serve: ' + filename);

    fs.readFile(filename, function (err, data) {
        if (err) {
            res.writeHead(404);
            return res.end("404 Not Found");
        }
        res.writeHead(200);
        res.write(data);
        return res.end();
    });
}

server = http.createServer(requestListener);

var lessons = ['Πληροφορική', 'Φυσική', 'Γυμναστική']; //TODO 

var question = null;
var counts = {};
var teacherWS = null;

wss_teacher = new ws.WebSocketServer({ noServer: true });
wss_student = new ws.WebSocketServer({ noServer: true });

wss_student.on('connection', function connection(_ws) {
    // _ws.send( JSON.stringify(
    //     {
    //         type: 'lessons',
    //         data: lessons
    //     }
    // ));

    _ws.on('message', function message(data) {
        ans = JSON.parse(data);
        ans = ans.answer;
        if(counts[ans]) {
            counts[ans] = counts[ans] + 1;
        } else {
            counts[ans] = 1;
        }
        teacherWS.send( JSON.stringify({
            type: 'counts',
            data: counts
        }) );
    });
    
    if(question && question.text) {
        sendQuestionToClient(_ws);
    }
    
});

wss_teacher.on('connection', function connection(_ws) {
    teacherWS = _ws;
    if(question && question.text) {
        _ws.send(JSON.stringify({
            type: 'question',
            data: question
        }));
        _ws.send(JSON.stringify({
            type: 'counts',
            data: counts
        }));
    }

    _ws.on('message', function message(data) {
        question = JSON.parse(data);
        wss_student.clients.forEach(client => {
            sendQuestionToClient(client);
        });
    });
});

var sendQuestionToClient = function(client) {
    if (client.readyState === ws.WebSocket.OPEN) {
        client.send( JSON.stringify(
            {
                type: 'question',
                data: question
            }
        ));
    }
}

server.on('upgrade', function upgrade(request, socket, head) {
    const { pathname } = url.parse(request.url);

    if (pathname === '/teacher') {
        wss_teacher.handleUpgrade(request, socket, head, function done(ws) {
            wss_teacher.emit('connection', ws, request);
        });
    } else if (pathname === '/student') {
        wss_student.handleUpgrade(request, socket, head, function done(ws) {
            wss_student.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

server.listen(8080);
console.log('listening to 8080 port');