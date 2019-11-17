const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const msg = require('./translation');
const formatMessage = require('format-message');

const menuIconURI = null;
const blockIconURI = null;

// https://widget.airmap.g0v.tw/create/LASS%24WF_12743501
const LASS_URI = 'https://pm25.lass-net.org/data/last.php?device_id=';
const defaultId = 'WF_12743501';
let theLocale = null;

/**
 * Enum for LASS specification.
 * @readonly
 * @enum {string}
 */
const LassAttr = {
    PM25: 's_d0',
    // PM10: 'PM10',
    tempc: 's_t0',
    // tempf: 'tempf',
    humidity: 's_h0'
};

class gasoLASS{
    constructor (runtime) {
        theLocale = this._setLocale();
        this.runtime = runtime;
        // communication related
        this.comm = runtime.ioDevices.comm;
        this.session = null;
        this.runtime.registerPeripheralExtension('gasoLASS', this);
        // session callbacks
        this.reporter = null;
        this.onmessage = this.onmessage.bind(this);
        this.onclose = this.onclose.bind(this);
        this.write = this.write.bind(this);
        // string op
        this.decoder = new TextDecoder();
        this.lineBuffer = '';
        this.data = {};
        this.emptyObj = {
            VALUE: {}
        };
    }

    onclose () {
        this.session = null;
    }

    write (data, parser = null){
        if (this.session){
            return new Promise(resolve => {
                if (parser){
                    this.reporter = {
                        parser,
                        resolve
                    };
                }
                this.session.write(data);
            });
        }
    }

    onmessage (data){
        const dataStr = this.decoder.decode(data);
        this.lineBuffer += dataStr;
        if (this.lineBuffer.indexOf('\n') !== -1){
            const lines = this.lineBuffer.split('\n');
            this.lineBuffer = lines.pop();
            for (const l of lines) {
                if (this.reporter) {
                    const {parser, resolve} = this.reporter;
                    resolve(parser(l));
                }
            }
        }
    }

    scan (){
        this.comm.getDeviceList().then(result => {
            this.runtime.emit(this.runtime.constructor.PERIPHERAL_LIST_UPDATE, result);
        });
    }

    _setLocale () {
        let nowLocale = '';
        switch (formatMessage.setup().locale) {
        case 'zh-tw':
            nowLocale = 'zh-tw';
            break;
        default:
            nowLocale = 'en';
            break;
        }
        return nowLocale;
    }

    getInfo (){
        return {
            id: 'gasoLASS',
            name: 'LASS',
            color1: '#4a90e2',
            color2: '#4a90e2',
            menuIconURI: menuIconURI,
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'fetchLASS',
                    blockType: BlockType.COMMAND,
                    arguments: {
                        id: {
                            type: ArgumentType.STRING,
                            defaultValue: defaultId
                        }
                    },
                    text: msg.fetchLASS
                },
                {
                    opcode: 'onLASSReceived',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    arguments: {
                        id: {
                            type: ArgumentType.STRING,
                            defaultValue: defaultId
                        }
                    },
                    text: msg.onLASSReceived
                },
                // {
                //     opcode: 'readFromLASS',
                //     blockType: BlockType.REPORTER,
                //     arguments: {
                //         id: {
                //             type: ArgumentType.STRING,
                //             defaultValue: defaultId
                //         }
                //     },
                //     text: '讀取設備編號為 [id] 的 LASS 資料'
                // },
                {
                    opcode: 'parseAttrFromLASS',
                    blockType: BlockType.REPORTER,
                    arguments: {
                        // variable: {
                        //     type: ArgumentType.STRING,
                        //     defaultValue: 'data'
                        // },
                        id: {
                            type: ArgumentType.STRING,
                            defaultValue: defaultId
                        },
                        attr: {
                            type: ArgumentType.STRING,
                            menu: 'lassAttrs',
                            defaultValue: LassAttr.PM25
                        }
                    },
                    text: msg.parseAttrFromLASS
                }
            ],
            menus: {
                lassAttrs: {
                    acceptReporters: true,
                    items: [
                        {
                            text: 'PM2.5',
                            value: LassAttr.PM25
                        },
                        // {
                        //     text: 'PM10',
                        //     value: LassAttr.PM10
                        // },
                        {
                            text: msg.tempc,
                            value: LassAttr.tempc
                        },
                        // {
                        //     text: '溫度 F',
                        //     value: LassAttr.tempf
                        // },
                        {
                            text: msg.humidity,
                            value: LassAttr.humidity
                        }
                    ]
                }
            }
        };
    }

    fetchLASS (args){
        const id = args.id;
        const url = `${LASS_URI}${id}`;
        return fetch(url).then(res => {
            if (res.ok) {
                res.json().then(json => {
                    console.log('got origin lass set', json.feeds);
                    const data = json.feeds && json.feeds[0] ? json.feeds[0][Object.keys(json.feeds[0])[0]] : 'fetch error';
                    this.data[id] = {
                        fetched: true,
                        data: JSON.stringify(data)
                    };
                    this.runtime.startHats('gasoLASS_onLASSReceived', {});
                });
            }
        });
    }

    isDataFetched (id) {
        return this.data[id] && this.data[id].fetched;
    }

    onLASSReceived (args){
        const id = args.id || defaultId;
        if (this.isDataFetched(id)) {
            console.log('got LASS data with id ', id);
            return true;
        }
    }

    // readFromLASS (args) {
    //     const id = args.id || defaultId;
    //     if (this.isDataFetched(id)) {
    //         return this.data[id].data;
    //     }
    //     return msg.readFromLASSErr[theLocale];
    // }

    parseAttrFromLASS (args){
        const id = args.id || defaultId;
        // const variable = args.variable || this.emptyObj;
        const attr = args.attr;
        if (this.isDataFetched(id)) {
            // return this.data[id].data;
            try {
                const parsed = JSON.parse(this.data[id].data);
                console.warn('parsed ', attr, parsed);
                const data = parsed[attr];
                return typeof data === 'string' ? data : JSON.stringify(data);
            } catch (err) {
                return `Error: ${err}`;
            }
        }
        return msg.readFromLASSErr[theLocale];
    }

}

module.exports = gasoLASS;
