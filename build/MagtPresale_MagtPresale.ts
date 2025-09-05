import {
    Cell,
    Slice,
    Address,
    Builder,
    beginCell,
    ComputeError,
    TupleItem,
    TupleReader,
    Dictionary,
    contractAddress,
    address,
    ContractProvider,
    Sender,
    Contract,
    ContractABI,
    ABIType,
    ABIGetter,
    ABIReceiver,
    TupleBuilder,
    DictionaryValue
} from '@ton/core';

export type DataSize = {
    $$type: 'DataSize';
    cells: bigint;
    bits: bigint;
    refs: bigint;
}

export function storeDataSize(src: DataSize) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.cells, 257);
        b_0.storeInt(src.bits, 257);
        b_0.storeInt(src.refs, 257);
    };
}

export function loadDataSize(slice: Slice) {
    const sc_0 = slice;
    const _cells = sc_0.loadIntBig(257);
    const _bits = sc_0.loadIntBig(257);
    const _refs = sc_0.loadIntBig(257);
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadGetterTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function storeTupleDataSize(source: DataSize) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.cells);
    builder.writeNumber(source.bits);
    builder.writeNumber(source.refs);
    return builder.build();
}

export function dictValueParserDataSize(): DictionaryValue<DataSize> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDataSize(src)).endCell());
        },
        parse: (src) => {
            return loadDataSize(src.loadRef().beginParse());
        }
    }
}

export type SignedBundle = {
    $$type: 'SignedBundle';
    signature: Buffer;
    signedData: Slice;
}

export function storeSignedBundle(src: SignedBundle) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBuffer(src.signature);
        b_0.storeBuilder(src.signedData.asBuilder());
    };
}

export function loadSignedBundle(slice: Slice) {
    const sc_0 = slice;
    const _signature = sc_0.loadBuffer(64);
    const _signedData = sc_0;
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadGetterTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function storeTupleSignedBundle(source: SignedBundle) {
    const builder = new TupleBuilder();
    builder.writeBuffer(source.signature);
    builder.writeSlice(source.signedData.asCell());
    return builder.build();
}

export function dictValueParserSignedBundle(): DictionaryValue<SignedBundle> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSignedBundle(src)).endCell());
        },
        parse: (src) => {
            return loadSignedBundle(src.loadRef().beginParse());
        }
    }
}

export type StateInit = {
    $$type: 'StateInit';
    code: Cell;
    data: Cell;
}

export function storeStateInit(src: StateInit) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeRef(src.code);
        b_0.storeRef(src.data);
    };
}

export function loadStateInit(slice: Slice) {
    const sc_0 = slice;
    const _code = sc_0.loadRef();
    const _data = sc_0.loadRef();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadGetterTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function storeTupleStateInit(source: StateInit) {
    const builder = new TupleBuilder();
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    return builder.build();
}

export function dictValueParserStateInit(): DictionaryValue<StateInit> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStateInit(src)).endCell());
        },
        parse: (src) => {
            return loadStateInit(src.loadRef().beginParse());
        }
    }
}

export type Context = {
    $$type: 'Context';
    bounceable: boolean;
    sender: Address;
    value: bigint;
    raw: Slice;
}

export function storeContext(src: Context) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBit(src.bounceable);
        b_0.storeAddress(src.sender);
        b_0.storeInt(src.value, 257);
        b_0.storeRef(src.raw.asCell());
    };
}

export function loadContext(slice: Slice) {
    const sc_0 = slice;
    const _bounceable = sc_0.loadBit();
    const _sender = sc_0.loadAddress();
    const _value = sc_0.loadIntBig(257);
    const _raw = sc_0.loadRef().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadGetterTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function storeTupleContext(source: Context) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.bounceable);
    builder.writeAddress(source.sender);
    builder.writeNumber(source.value);
    builder.writeSlice(source.raw.asCell());
    return builder.build();
}

export function dictValueParserContext(): DictionaryValue<Context> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeContext(src)).endCell());
        },
        parse: (src) => {
            return loadContext(src.loadRef().beginParse());
        }
    }
}

export type SendParameters = {
    $$type: 'SendParameters';
    mode: bigint;
    body: Cell | null;
    code: Cell | null;
    data: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeSendParameters(src: SendParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        if (src.code !== null && src.code !== undefined) { b_0.storeBit(true).storeRef(src.code); } else { b_0.storeBit(false); }
        if (src.data !== null && src.data !== undefined) { b_0.storeBit(true).storeRef(src.data); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadSendParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _code = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _data = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleSendParameters(source: SendParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserSendParameters(): DictionaryValue<SendParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSendParameters(src)).endCell());
        },
        parse: (src) => {
            return loadSendParameters(src.loadRef().beginParse());
        }
    }
}

export type MessageParameters = {
    $$type: 'MessageParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeMessageParameters(src: MessageParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadMessageParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleMessageParameters(source: MessageParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserMessageParameters(): DictionaryValue<MessageParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMessageParameters(src)).endCell());
        },
        parse: (src) => {
            return loadMessageParameters(src.loadRef().beginParse());
        }
    }
}

export type DeployParameters = {
    $$type: 'DeployParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    bounce: boolean;
    init: StateInit;
}

export function storeDeployParameters(src: DeployParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeBit(src.bounce);
        b_0.store(storeStateInit(src.init));
    };
}

export function loadDeployParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _bounce = sc_0.loadBit();
    const _init = loadStateInit(sc_0);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadGetterTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadGetterTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function storeTupleDeployParameters(source: DeployParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeBoolean(source.bounce);
    builder.writeTuple(storeTupleStateInit(source.init));
    return builder.build();
}

export function dictValueParserDeployParameters(): DictionaryValue<DeployParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployParameters(src)).endCell());
        },
        parse: (src) => {
            return loadDeployParameters(src.loadRef().beginParse());
        }
    }
}

export type StdAddress = {
    $$type: 'StdAddress';
    workchain: bigint;
    address: bigint;
}

export function storeStdAddress(src: StdAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 8);
        b_0.storeUint(src.address, 256);
    };
}

export function loadStdAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(8);
    const _address = sc_0.loadUintBig(256);
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleStdAddress(source: StdAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeNumber(source.address);
    return builder.build();
}

export function dictValueParserStdAddress(): DictionaryValue<StdAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStdAddress(src)).endCell());
        },
        parse: (src) => {
            return loadStdAddress(src.loadRef().beginParse());
        }
    }
}

export type VarAddress = {
    $$type: 'VarAddress';
    workchain: bigint;
    address: Slice;
}

export function storeVarAddress(src: VarAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 32);
        b_0.storeRef(src.address.asCell());
    };
}

export function loadVarAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(32);
    const _address = sc_0.loadRef().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleVarAddress(source: VarAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeSlice(source.address.asCell());
    return builder.build();
}

export function dictValueParserVarAddress(): DictionaryValue<VarAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeVarAddress(src)).endCell());
        },
        parse: (src) => {
            return loadVarAddress(src.loadRef().beginParse());
        }
    }
}

export type BasechainAddress = {
    $$type: 'BasechainAddress';
    hash: bigint | null;
}

export function storeBasechainAddress(src: BasechainAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        if (src.hash !== null && src.hash !== undefined) { b_0.storeBit(true).storeInt(src.hash, 257); } else { b_0.storeBit(false); }
    };
}

export function loadBasechainAddress(slice: Slice) {
    const sc_0 = slice;
    const _hash = sc_0.loadBit() ? sc_0.loadIntBig(257) : null;
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadGetterTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function storeTupleBasechainAddress(source: BasechainAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.hash);
    return builder.build();
}

export function dictValueParserBasechainAddress(): DictionaryValue<BasechainAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBasechainAddress(src)).endCell());
        },
        parse: (src) => {
            return loadBasechainAddress(src.loadRef().beginParse());
        }
    }
}

export type Deploy = {
    $$type: 'Deploy';
    queryId: bigint;
}

export function storeDeploy(src: Deploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2490013878, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2490013878) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadGetterTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function storeTupleDeploy(source: Deploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeploy(): DictionaryValue<Deploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadDeploy(src.loadRef().beginParse());
        }
    }
}

export type DeployOk = {
    $$type: 'DeployOk';
    queryId: bigint;
}

export function storeDeployOk(src: DeployOk) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2952335191, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeployOk(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2952335191) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadGetterTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function storeTupleDeployOk(source: DeployOk) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeployOk(): DictionaryValue<DeployOk> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployOk(src)).endCell());
        },
        parse: (src) => {
            return loadDeployOk(src.loadRef().beginParse());
        }
    }
}

export type FactoryDeploy = {
    $$type: 'FactoryDeploy';
    queryId: bigint;
    cashback: Address;
}

export function storeFactoryDeploy(src: FactoryDeploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1829761339, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.cashback);
    };
}

export function loadFactoryDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1829761339) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _cashback = sc_0.loadAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadGetterTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function storeTupleFactoryDeploy(source: FactoryDeploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeAddress(source.cashback);
    return builder.build();
}

export function dictValueParserFactoryDeploy(): DictionaryValue<FactoryDeploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFactoryDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadFactoryDeploy(src.loadRef().beginParse());
        }
    }
}

export type Buy = {
    $$type: 'Buy';
    ref: Address | null;
}

export function storeBuy(src: Buy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2611342469, 32);
        b_0.storeAddress(src.ref);
    };
}

export function loadBuy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2611342469) { throw Error('Invalid prefix'); }
    const _ref = sc_0.loadMaybeAddress();
    return { $$type: 'Buy' as const, ref: _ref };
}

export function loadTupleBuy(source: TupleReader) {
    const _ref = source.readAddressOpt();
    return { $$type: 'Buy' as const, ref: _ref };
}

export function loadGetterTupleBuy(source: TupleReader) {
    const _ref = source.readAddressOpt();
    return { $$type: 'Buy' as const, ref: _ref };
}

export function storeTupleBuy(source: Buy) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.ref);
    return builder.build();
}

export function dictValueParserBuy(): DictionaryValue<Buy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBuy(src)).endCell());
        },
        parse: (src) => {
            return loadBuy(src.loadRef().beginParse());
        }
    }
}

export type SetJettonWallet = {
    $$type: 'SetJettonWallet';
    addr: Address;
}

export function storeSetJettonWallet(src: SetJettonWallet) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1213265332, 32);
        b_0.storeAddress(src.addr);
    };
}

export function loadSetJettonWallet(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1213265332) { throw Error('Invalid prefix'); }
    const _addr = sc_0.loadAddress();
    return { $$type: 'SetJettonWallet' as const, addr: _addr };
}

export function loadTupleSetJettonWallet(source: TupleReader) {
    const _addr = source.readAddress();
    return { $$type: 'SetJettonWallet' as const, addr: _addr };
}

export function loadGetterTupleSetJettonWallet(source: TupleReader) {
    const _addr = source.readAddress();
    return { $$type: 'SetJettonWallet' as const, addr: _addr };
}

export function storeTupleSetJettonWallet(source: SetJettonWallet) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.addr);
    return builder.build();
}

export function dictValueParserSetJettonWallet(): DictionaryValue<SetJettonWallet> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSetJettonWallet(src)).endCell());
        },
        parse: (src) => {
            return loadSetJettonWallet(src.loadRef().beginParse());
        }
    }
}

export type SetPaused = {
    $$type: 'SetPaused';
    state: boolean;
}

export function storeSetPaused(src: SetPaused) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(4222196280, 32);
        b_0.storeBit(src.state);
    };
}

export function loadSetPaused(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 4222196280) { throw Error('Invalid prefix'); }
    const _state = sc_0.loadBit();
    return { $$type: 'SetPaused' as const, state: _state };
}

export function loadTupleSetPaused(source: TupleReader) {
    const _state = source.readBoolean();
    return { $$type: 'SetPaused' as const, state: _state };
}

export function loadGetterTupleSetPaused(source: TupleReader) {
    const _state = source.readBoolean();
    return { $$type: 'SetPaused' as const, state: _state };
}

export function storeTupleSetPaused(source: SetPaused) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.state);
    return builder.build();
}

export function dictValueParserSetPaused(): DictionaryValue<SetPaused> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSetPaused(src)).endCell());
        },
        parse: (src) => {
            return loadSetPaused(src.loadRef().beginParse());
        }
    }
}

export type WithdrawTon = {
    $$type: 'WithdrawTon';
    to: Address;
    amount: bigint;
}

export function storeWithdrawTon(src: WithdrawTon) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2066906864, 32);
        b_0.storeAddress(src.to);
        b_0.storeInt(src.amount, 257);
    };
}

export function loadWithdrawTon(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2066906864) { throw Error('Invalid prefix'); }
    const _to = sc_0.loadAddress();
    const _amount = sc_0.loadIntBig(257);
    return { $$type: 'WithdrawTon' as const, to: _to, amount: _amount };
}

export function loadTupleWithdrawTon(source: TupleReader) {
    const _to = source.readAddress();
    const _amount = source.readBigNumber();
    return { $$type: 'WithdrawTon' as const, to: _to, amount: _amount };
}

export function loadGetterTupleWithdrawTon(source: TupleReader) {
    const _to = source.readAddress();
    const _amount = source.readBigNumber();
    return { $$type: 'WithdrawTon' as const, to: _to, amount: _amount };
}

export function storeTupleWithdrawTon(source: WithdrawTon) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.to);
    builder.writeNumber(source.amount);
    return builder.build();
}

export function dictValueParserWithdrawTon(): DictionaryValue<WithdrawTon> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeWithdrawTon(src)).endCell());
        },
        parse: (src) => {
            return loadWithdrawTon(src.loadRef().beginParse());
        }
    }
}

export type AdminTransfer = {
    $$type: 'AdminTransfer';
    to: Address;
    amount: bigint;
}

export function storeAdminTransfer(src: AdminTransfer) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2802657700, 32);
        b_0.storeAddress(src.to);
        b_0.storeInt(src.amount, 257);
    };
}

export function loadAdminTransfer(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2802657700) { throw Error('Invalid prefix'); }
    const _to = sc_0.loadAddress();
    const _amount = sc_0.loadIntBig(257);
    return { $$type: 'AdminTransfer' as const, to: _to, amount: _amount };
}

export function loadTupleAdminTransfer(source: TupleReader) {
    const _to = source.readAddress();
    const _amount = source.readBigNumber();
    return { $$type: 'AdminTransfer' as const, to: _to, amount: _amount };
}

export function loadGetterTupleAdminTransfer(source: TupleReader) {
    const _to = source.readAddress();
    const _amount = source.readBigNumber();
    return { $$type: 'AdminTransfer' as const, to: _to, amount: _amount };
}

export function storeTupleAdminTransfer(source: AdminTransfer) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.to);
    builder.writeNumber(source.amount);
    return builder.build();
}

export function dictValueParserAdminTransfer(): DictionaryValue<AdminTransfer> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeAdminTransfer(src)).endCell());
        },
        parse: (src) => {
            return loadAdminTransfer(src.loadRef().beginParse());
        }
    }
}

export type Level = {
    $$type: 'Level';
    tokens: bigint;
    price: bigint;
}

export function storeLevel(src: Level) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.tokens, 257);
        b_0.storeInt(src.price, 257);
    };
}

export function loadLevel(slice: Slice) {
    const sc_0 = slice;
    const _tokens = sc_0.loadIntBig(257);
    const _price = sc_0.loadIntBig(257);
    return { $$type: 'Level' as const, tokens: _tokens, price: _price };
}

export function loadTupleLevel(source: TupleReader) {
    const _tokens = source.readBigNumber();
    const _price = source.readBigNumber();
    return { $$type: 'Level' as const, tokens: _tokens, price: _price };
}

export function loadGetterTupleLevel(source: TupleReader) {
    const _tokens = source.readBigNumber();
    const _price = source.readBigNumber();
    return { $$type: 'Level' as const, tokens: _tokens, price: _price };
}

export function storeTupleLevel(source: Level) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.tokens);
    builder.writeNumber(source.price);
    return builder.build();
}

export function dictValueParserLevel(): DictionaryValue<Level> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeLevel(src)).endCell());
        },
        parse: (src) => {
            return loadLevel(src.loadRef().beginParse());
        }
    }
}

export type MagtPresale$Data = {
    $$type: 'MagtPresale$Data';
    owner: Address;
    treasury: Address;
    jw: Address | null;
    decimals: bigint;
    paused: boolean;
    sold: bigint;
    levels: Dictionary<bigint, Level>;
    levelsCount: bigint;
    refBps: bigint;
}

export function storeMagtPresale$Data(src: MagtPresale$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.treasury);
        b_0.storeAddress(src.jw);
        const b_1 = new Builder();
        b_1.storeInt(src.decimals, 257);
        b_1.storeBit(src.paused);
        b_1.storeInt(src.sold, 257);
        b_1.storeDict(src.levels, Dictionary.Keys.BigInt(257), dictValueParserLevel());
        b_1.storeInt(src.levelsCount, 257);
        const b_2 = new Builder();
        b_2.storeInt(src.refBps, 257);
        b_1.storeRef(b_2.endCell());
        b_0.storeRef(b_1.endCell());
    };
}

export function loadMagtPresale$Data(slice: Slice) {
    const sc_0 = slice;
    const _owner = sc_0.loadAddress();
    const _treasury = sc_0.loadAddress();
    const _jw = sc_0.loadMaybeAddress();
    const sc_1 = sc_0.loadRef().beginParse();
    const _decimals = sc_1.loadIntBig(257);
    const _paused = sc_1.loadBit();
    const _sold = sc_1.loadIntBig(257);
    const _levels = Dictionary.load(Dictionary.Keys.BigInt(257), dictValueParserLevel(), sc_1);
    const _levelsCount = sc_1.loadIntBig(257);
    const sc_2 = sc_1.loadRef().beginParse();
    const _refBps = sc_2.loadIntBig(257);
    return { $$type: 'MagtPresale$Data' as const, owner: _owner, treasury: _treasury, jw: _jw, decimals: _decimals, paused: _paused, sold: _sold, levels: _levels, levelsCount: _levelsCount, refBps: _refBps };
}

export function loadTupleMagtPresale$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _treasury = source.readAddress();
    const _jw = source.readAddressOpt();
    const _decimals = source.readBigNumber();
    const _paused = source.readBoolean();
    const _sold = source.readBigNumber();
    const _levels = Dictionary.loadDirect(Dictionary.Keys.BigInt(257), dictValueParserLevel(), source.readCellOpt());
    const _levelsCount = source.readBigNumber();
    const _refBps = source.readBigNumber();
    return { $$type: 'MagtPresale$Data' as const, owner: _owner, treasury: _treasury, jw: _jw, decimals: _decimals, paused: _paused, sold: _sold, levels: _levels, levelsCount: _levelsCount, refBps: _refBps };
}

export function loadGetterTupleMagtPresale$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _treasury = source.readAddress();
    const _jw = source.readAddressOpt();
    const _decimals = source.readBigNumber();
    const _paused = source.readBoolean();
    const _sold = source.readBigNumber();
    const _levels = Dictionary.loadDirect(Dictionary.Keys.BigInt(257), dictValueParserLevel(), source.readCellOpt());
    const _levelsCount = source.readBigNumber();
    const _refBps = source.readBigNumber();
    return { $$type: 'MagtPresale$Data' as const, owner: _owner, treasury: _treasury, jw: _jw, decimals: _decimals, paused: _paused, sold: _sold, levels: _levels, levelsCount: _levelsCount, refBps: _refBps };
}

export function storeTupleMagtPresale$Data(source: MagtPresale$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.owner);
    builder.writeAddress(source.treasury);
    builder.writeAddress(source.jw);
    builder.writeNumber(source.decimals);
    builder.writeBoolean(source.paused);
    builder.writeNumber(source.sold);
    builder.writeCell(source.levels.size > 0 ? beginCell().storeDictDirect(source.levels, Dictionary.Keys.BigInt(257), dictValueParserLevel()).endCell() : null);
    builder.writeNumber(source.levelsCount);
    builder.writeNumber(source.refBps);
    return builder.build();
}

export function dictValueParserMagtPresale$Data(): DictionaryValue<MagtPresale$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMagtPresale$Data(src)).endCell());
        },
        parse: (src) => {
            return loadMagtPresale$Data(src.loadRef().beginParse());
        }
    }
}

 type MagtPresale_init_args = {
    $$type: 'MagtPresale_init_args';
    owner: Address;
    treasury: Address;
    decimals: bigint;
    levels: Dictionary<bigint, Level>;
    levelsCount: bigint;
    refBps: bigint;
}

function initMagtPresale_init_args(src: MagtPresale_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.treasury);
        b_0.storeInt(src.decimals, 257);
        b_0.storeDict(src.levels, Dictionary.Keys.BigInt(257), dictValueParserLevel());
        const b_1 = new Builder();
        b_1.storeInt(src.levelsCount, 257);
        b_1.storeInt(src.refBps, 257);
        b_0.storeRef(b_1.endCell());
    };
}

async function MagtPresale_init(owner: Address, treasury: Address, decimals: bigint, levels: Dictionary<bigint, Level>, levelsCount: bigint, refBps: bigint) {
    const __code = Cell.fromHex('b5ee9c7241021701000724000114ff00f4a413f4bcf2c80b010130d301d072d721d200d200fa4021103450666f04f86102f8620202fced44d0d200018e36fa40fa40d72c01916d93fa4001e201d401d0810101d700d200810101d700f404810101d700d430d0810101d700301069106810676c198e2efa40fa40810101d700f404d401d0810101d700810101d70030102610251024102306d1550470706d064515504403e20a925f0ae07029d74920c21fe300210304000a3109d31f0a03fe82104850f5b4ba8e595b3507fa40308200b35df84228c705f2f410681057061035443012c87f01ca0055805089ce16ce5004206e9430cf84809201cee202c8810101cf00ca0012810101cf0012f40012810101cf0002c8810101cf0012cdcdc9ed54e0218210fba99a38bae3022182107b327ef0bae302218210a70d29a4ba05060700b25b3307d200308200b35df84228c705f2f410681057104610354334c87f01ca0055805089ce16ce5004206e9430cf84809201cee202c8810101cf00ca0012810101cf0012f40012810101cf0002c8810101cf0012cdcdc9ed5403ea5b08fa4031810101d700308200b35df84229c705f2f4f8276f1082080f4240a121c200923120df7002db3cdb3c20c2008e3c52606d7070046d03046d5023c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb009130e21068551512140a02fa8ef95b08fa40810101d700308200b35df8422ac705f2f481741f276eb3f2f482009f4b21c200f2f4108a107910681057104610351024820b938700db3cc87f01ca0055805089ce16ce5004206e9430cf84809201cee202c8810101cf00ca0012810101cf0012f40012810101cf0002c8810101cf0012cdcdc9ed54e021160803fe82109ba5ec85ba8ee55b08d72c01916d93fa4001e231f842f8416f24135f03109b108a1079106810571046103558db3cc87f01ca0055805089ce16ce5004206e9430cf84809201cee202c8810101cf00ca0012810101cf0012f40012810101cf0002c8810101cf0012cdcdc9ed54e0218210946a98b6bae3023ac00009c1210c090b01845b08d33f30c8018210aff90f5758cb1fcb3fc9107910681057104610354430f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb000a007cc87f01ca0055805089ce16ce5004206e9430cf84809201cee202c8810101cf00ca0012810101cf0012f40012810101cf0002c8810101cf0012cdcdc9ed5401c419b08ed8f842f8416f24135f03108a1079106810571046103510246ddb3cc87f01ca0055805089ce16ce5004206e9430cf84809201cee202c8810101cf00ca0012810101cf0012f40012810101cf0002c8810101cf0012cdcdc9ed54e05f09f2c0820c03f28129ff28c000f2f48200d271228208989680bef2f481741f2a6eb3f2f45582db3c82008dd15351b9f2f42b7053609a23c2009320c0009170e28ae810235f038200ef7221c200f2f4702c6eb38e22547ccec705b395f828c705b3923070e29323c2009170e299305302a8812710a904dede5361a013a120c1000d0e13006e7020935303b98e2d248101012259f40d6fa192306ddf206e92306d8e10d0810101d700810101d700596c126f02e26f223012a001a4e83002fe108d107c106b105a1049103d4cba2bdb3c8200b7575313b9f2f4238101012259f40d6fa192306ddf206e92306d8e10d0810101d700810101d700596c126f02e26f227020935304b98e2d278101012259f40d6fa192306ddf206e92306d8e10d0810101d700810101d700596c126f02e26f223012a001a4e830335321a02fa10f10008ceda2edfb7020935304b98e36258101012259f40d6fa192306ddf206e92306d8e10d0810101d700810101d700596c126f02e26f223012a05320b9943031db31e001a4e85f032102ae20c101955b3d500ca08f3c6c2227db3c561021a823a90458db3c20c101945f033a718e205203a801a90451e1a050dda051eda10d92713bdf53d9be92713bde10cd10bc0ae20a0be2108d107c106b105a104910384706051112001e7170935302b99501a70a01a4e83031000e5cb991309131e204a68e86017002a0db3c985320bc91329130e2e2810ad721c200f2f45155a021a0820afaf08022c20091209170e25210a082081e8480a00e700fa11edb3c10ab109b108b107b106b505b144330541e0ddb3c2cc20014141615000e5cbc91309131e201d88e96108b107a1069105810471036451350cc4414db3c556295102c3a3a30e226c2008e3c52476d7070046d03046d5023c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb009136e21048103746145052131600c2c85203fa02305213cf1630f8285210cf16307021ca00302082080f4240fa02307021ca0030c928597070046d03046d5023c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb003edbfd6d');
    const builder = beginCell();
    builder.storeUint(0, 1);
    initMagtPresale_init_args({ $$type: 'MagtPresale_init_args', owner, treasury, decimals, levels, levelsCount, refBps })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

export const MagtPresale_errors = {
    2: { message: "Stack underflow" },
    3: { message: "Stack overflow" },
    4: { message: "Integer overflow" },
    5: { message: "Integer out of expected range" },
    6: { message: "Invalid opcode" },
    7: { message: "Type check error" },
    8: { message: "Cell overflow" },
    9: { message: "Cell underflow" },
    10: { message: "Dictionary error" },
    11: { message: "'Unknown' error" },
    12: { message: "Fatal error" },
    13: { message: "Out of gas error" },
    14: { message: "Virtualization error" },
    32: { message: "Action list is invalid" },
    33: { message: "Action list is too long" },
    34: { message: "Action is invalid or not supported" },
    35: { message: "Invalid source address in outbound message" },
    36: { message: "Invalid destination address in outbound message" },
    37: { message: "Not enough Toncoin" },
    38: { message: "Not enough extra currencies" },
    39: { message: "Outbound message does not fit into a cell after rewriting" },
    40: { message: "Cannot process a message" },
    41: { message: "Library reference is null" },
    42: { message: "Library change action error" },
    43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
    50: { message: "Account state size exceeded limits" },
    128: { message: "Null reference exception" },
    129: { message: "Invalid serialization prefix" },
    130: { message: "Invalid incoming message" },
    131: { message: "Constraints error" },
    132: { message: "Access denied" },
    133: { message: "Contract stopped" },
    134: { message: "Invalid argument" },
    135: { message: "Code of a contract was not found" },
    136: { message: "Invalid standard address" },
    138: { message: "Not a basechain address" },
    2775: { message: "ZERO_OUT2" },
    10751: { message: "PAUSED" },
    29727: { message: "NO_JW" },
    36305: { message: "SOLD_OUT" },
    40779: { message: "ZERO_AMT" },
    45917: { message: "NOT_ADMIN" },
    46935: { message: "SOLD_OUT_L" },
    53873: { message: "LOW_TON" },
    61298: { message: "ZERO_OUT" },
} as const

export const MagtPresale_errors_backward = {
    "Stack underflow": 2,
    "Stack overflow": 3,
    "Integer overflow": 4,
    "Integer out of expected range": 5,
    "Invalid opcode": 6,
    "Type check error": 7,
    "Cell overflow": 8,
    "Cell underflow": 9,
    "Dictionary error": 10,
    "'Unknown' error": 11,
    "Fatal error": 12,
    "Out of gas error": 13,
    "Virtualization error": 14,
    "Action list is invalid": 32,
    "Action list is too long": 33,
    "Action is invalid or not supported": 34,
    "Invalid source address in outbound message": 35,
    "Invalid destination address in outbound message": 36,
    "Not enough Toncoin": 37,
    "Not enough extra currencies": 38,
    "Outbound message does not fit into a cell after rewriting": 39,
    "Cannot process a message": 40,
    "Library reference is null": 41,
    "Library change action error": 42,
    "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
    "Account state size exceeded limits": 50,
    "Null reference exception": 128,
    "Invalid serialization prefix": 129,
    "Invalid incoming message": 130,
    "Constraints error": 131,
    "Access denied": 132,
    "Contract stopped": 133,
    "Invalid argument": 134,
    "Code of a contract was not found": 135,
    "Invalid standard address": 136,
    "Not a basechain address": 138,
    "ZERO_OUT2": 2775,
    "PAUSED": 10751,
    "NO_JW": 29727,
    "SOLD_OUT": 36305,
    "ZERO_AMT": 40779,
    "NOT_ADMIN": 45917,
    "SOLD_OUT_L": 46935,
    "LOW_TON": 53873,
    "ZERO_OUT": 61298,
} as const

const MagtPresale_types: ABIType[] = [
    {"name":"DataSize","header":null,"fields":[{"name":"cells","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bits","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"refs","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"SignedBundle","header":null,"fields":[{"name":"signature","type":{"kind":"simple","type":"fixed-bytes","optional":false,"format":64}},{"name":"signedData","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"StateInit","header":null,"fields":[{"name":"code","type":{"kind":"simple","type":"cell","optional":false}},{"name":"data","type":{"kind":"simple","type":"cell","optional":false}}]},
    {"name":"Context","header":null,"fields":[{"name":"bounceable","type":{"kind":"simple","type":"bool","optional":false}},{"name":"sender","type":{"kind":"simple","type":"address","optional":false}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"raw","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"SendParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"code","type":{"kind":"simple","type":"cell","optional":true}},{"name":"data","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"MessageParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"DeployParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}},{"name":"init","type":{"kind":"simple","type":"StateInit","optional":false}}]},
    {"name":"StdAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":8}},{"name":"address","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"VarAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"address","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"BasechainAddress","header":null,"fields":[{"name":"hash","type":{"kind":"simple","type":"int","optional":true,"format":257}}]},
    {"name":"Deploy","header":2490013878,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"DeployOk","header":2952335191,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"FactoryDeploy","header":1829761339,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"cashback","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"Buy","header":2611342469,"fields":[{"name":"ref","type":{"kind":"simple","type":"address","optional":true}}]},
    {"name":"SetJettonWallet","header":1213265332,"fields":[{"name":"addr","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"SetPaused","header":4222196280,"fields":[{"name":"state","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"WithdrawTon","header":2066906864,"fields":[{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"amount","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"AdminTransfer","header":2802657700,"fields":[{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"amount","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"Level","header":null,"fields":[{"name":"tokens","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"price","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"MagtPresale$Data","header":null,"fields":[{"name":"owner","type":{"kind":"simple","type":"address","optional":false}},{"name":"treasury","type":{"kind":"simple","type":"address","optional":false}},{"name":"jw","type":{"kind":"simple","type":"address","optional":true}},{"name":"decimals","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"paused","type":{"kind":"simple","type":"bool","optional":false}},{"name":"sold","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"levels","type":{"kind":"dict","key":"int","value":"Level","valueFormat":"ref"}},{"name":"levelsCount","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"refBps","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
]

const MagtPresale_opcodes = {
    "Deploy": 2490013878,
    "DeployOk": 2952335191,
    "FactoryDeploy": 1829761339,
    "Buy": 2611342469,
    "SetJettonWallet": 1213265332,
    "SetPaused": 4222196280,
    "WithdrawTon": 2066906864,
    "AdminTransfer": 2802657700,
}

const MagtPresale_getters: ABIGetter[] = [
]

export const MagtPresale_getterMapping: { [key: string]: string } = {
}

const MagtPresale_receivers: ABIReceiver[] = [
    {"receiver":"internal","message":{"kind":"typed","type":"SetJettonWallet"}},
    {"receiver":"internal","message":{"kind":"typed","type":"SetPaused"}},
    {"receiver":"internal","message":{"kind":"typed","type":"WithdrawTon"}},
    {"receiver":"internal","message":{"kind":"typed","type":"AdminTransfer"}},
    {"receiver":"internal","message":{"kind":"typed","type":"Buy"}},
    {"receiver":"internal","message":{"kind":"empty"}},
    {"receiver":"internal","message":{"kind":"typed","type":"Deploy"}},
]


export class MagtPresale implements Contract {
    
    public static readonly storageReserve = 0n;
    public static readonly errors = MagtPresale_errors_backward;
    public static readonly opcodes = MagtPresale_opcodes;
    
    static async init(owner: Address, treasury: Address, decimals: bigint, levels: Dictionary<bigint, Level>, levelsCount: bigint, refBps: bigint) {
        return await MagtPresale_init(owner, treasury, decimals, levels, levelsCount, refBps);
    }
    
    static async fromInit(owner: Address, treasury: Address, decimals: bigint, levels: Dictionary<bigint, Level>, levelsCount: bigint, refBps: bigint) {
        const __gen_init = await MagtPresale_init(owner, treasury, decimals, levels, levelsCount, refBps);
        const address = contractAddress(0, __gen_init);
        return new MagtPresale(address, __gen_init);
    }
    
    static fromAddress(address: Address) {
        return new MagtPresale(address);
    }
    
    readonly address: Address; 
    readonly init?: { code: Cell, data: Cell };
    readonly abi: ContractABI = {
        types:  MagtPresale_types,
        getters: MagtPresale_getters,
        receivers: MagtPresale_receivers,
        errors: MagtPresale_errors,
    };
    
    constructor(address: Address, init?: { code: Cell, data: Cell }) {
        this.address = address;
        this.init = init;
    }
    
    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean| null | undefined }, message: SetJettonWallet | SetPaused | WithdrawTon | AdminTransfer | Buy | null | Deploy) {
        
        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SetJettonWallet') {
            body = beginCell().store(storeSetJettonWallet(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SetPaused') {
            body = beginCell().store(storeSetPaused(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'WithdrawTon') {
            body = beginCell().store(storeWithdrawTon(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'AdminTransfer') {
            body = beginCell().store(storeAdminTransfer(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Buy') {
            body = beginCell().store(storeBuy(message)).endCell();
        }
        if (message === null) {
            body = new Cell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Deploy') {
            body = beginCell().store(storeDeploy(message)).endCell();
        }
        if (body === null) { throw new Error('Invalid message type'); }
        
        await provider.internal(via, { ...args, body: body });
        
    }
    
}