
let express = require('express');
let app = express();
let fs = require('fs/promises');
let fss = require('fs');
let { Server } = require('socket.io');
const http = require('http');
const server = http.createServer(app);
const ioServer = new Server(server);
let { io } = require('socket.io-client');
const winston = require('winston');
const logger = winston.createLogger({
    level: 'debug'
});
logger.add(new winston.transports.Console());
const { EventEmitter } = require('events');

let config = JSON.parse(fss.readFileSync('config.json'));

class Blockchain extends EventEmitter {
    constructor(state) {
        super();
        this.blockchain = [];
        this.is_authority = state.is_authority || false;
        this.blocks = {};
        this.broadcast_timer = null;
        this.save_timer = null;

        this.txset = {};
        this.txpool = {};

        this.dids = {};

        // disable save temporarily
        this.save_timer = true;
        for(let block of state.blockchain) {
            if(!this.addBlock(block)) {
                winston.error("failed to load blockchain at block " + block.hash);
            };
        }
        this.save_timer = null;
    }

    addBlock(block) {
        let prevHash;
        if(this.blockchain.length > 0) {
            prevHash = this.blockchain[this.blockchain.length-1].hash;
            if(prevHash === block.hash) return false; // duplicate
            if(prevHash !== block.prevHash) return false; // obsolete
            if(block.id != this.blockchain.length) throw new Exception("inconsistent block id");
        } else {
            prevHash = block.prevHash; // genesis
        }

        for(let tx of block.txs) {
            if(tx.hash in this.txset) {
                throw new Exception("duplicate tx");
            }
            this.txset[tx.hash] = tx;
            this.handleTx(tx);
        }

        this.blockchain.push(block);
        this.blocks[block.hash] = block;
        if(!this.broadcast_timer) {
            this.broadcast_timer = setTimeout(() => this.broadcast(), 10000);
        }
        console.log("emit block");
        this.emit("block", block);
        this.save();
        return true;
    }

    handleTx(tx) {
        console.log("handleTx : ", JSON.stringify(tx));

        switch(tx.action) {
            case "update":
                this.did[tx.name] = tx.content;
                break;

            case "delete":
                delete this.did[tx.name];
                break;

            default:
                throw "Invalid action";
        }
    }

    submitTx(tx) {
        if(tx.hash in this.txset) return false; // duplicate
        if(tx.hash in this.txpool) return false; // duplicate
        this.txpool[tx.hash] = tx;
        this.emit("tx", tx);
    }

    randomHash() {
        let hash = "";
        for(let i = 0; i < 32; i++) {
            hash += "0123456789abcdef".charAt(Math.floor(Math.random()*16));
        }
        return hash;
    }

    last_block() {
        return this.blockchain[this.blockchain.length-1];
    }

    broadcast() {
        this.broadcast_timer = null;
        if(!this.is_authority) return;

        console.log("broadcasting");
        let lastBlock = this.last_block();
        console.log(lastBlock);
        let block = {
            id: lastBlock.id+1,
            prevHash: lastBlock.hash,
            hash: this.randomHash(),
            txs: []
        };
        console.log(block);
        console.log(this.addBlock(block));
    }

    save() {
        if(!this.save_timer)
            this.save_timer = this.do_save();
    }

    async do_save() {
        let data = {
            blockchain: this.blockchain,
            is_authority: this.is_authority,
        }
        await fs.writeFile(".state.json.tmp", JSON.stringify(data, null, 4));
        await fs.rename(".state.json.tmp", "state.json");
        this.save_timer = null;
    }
}

let state = JSON.parse(fss.readFileSync("state.json"));
let bc = new Blockchain(state);
let serverSockets = [];

for(let server of config.servers) {
    console.log("Subscribing to " + server.name);
    let serverSocket = io(server.addr);
    serverSocket.on('connect', () => {
        logger.debug("Connected to " + server.name);
        serverSocket.emit("init", bc.last_block().hash);
    })
    serverSocket.on('disconnect', () => {
        logger.debug("Disconnected from " + server.name);
    })
    serverSocket.on('block', (block) => {
        logger.debug("Received block from " + server.name + ": " + JSON.stringify(block));
        bc.addBlock(block);
    })
    serverSocket.on('tx', (tx) => {
        logger.debug("Received tx from " + server.name + ": " + JSON.stringify(tx));
        bc.submitTx(tx);
    })
    serverSockets.push(serverSocket);
}

ioServer.on('connection', (socket) => {
    socket.on('init', (hash) => {
        console.log("received init");
        // send all blocks
        let found = false;
        for(let block of bc.blockchain) {
            if(!found) {
                if(block.hash === hash) found = true; else continue;
            }
            socket.emit('block', block);
        }
    });
})

bc.on("block", (block) => {
    console.log("on block: " + serverSockets.length);
    ioServer.emit("block", block);
})

bc.on("tx", (tx) => {
    ioServer.emit("tx", tx);
})

app.use(express.json());
    
app.post('/', (req, res) => {
    console.log(req.body.name)
    res.end();
})
    
app.post('/submit', (req, res) => {
    bc.submitTx(req.body);
    res.end();
})

ioServer.on('connection', (socket) => {
    console.log("a user connected");
})

let port = config.port;

server.listen(port, '127.0.0.1', function(err){
    if (err) console.log(err);
    console.log("Server listening on 127.0.0.1 " + port);
});