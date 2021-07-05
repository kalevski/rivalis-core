import Exception from './Exception'
import Adapter from '../interfaces/Adapter'
import AuthResolver from './AuthResolver'
import Protocol from '../interfaces/Protocol'
import Stage from './Stage'
import NodePersistence from '../persistence/NodePersistence'
import Sync from '../persistence/Sync'
import Context from './Context'
import LoggingFactory from '../structs/LoggingFactory'
import Logger from './Logger'

class Rivalis {

    /**
     * @type {LoggingFactory}
     */
    logging = null

    /**
     * @private
     * @type {NodePersistence}
     */
    persistence = null

    /**
     * @private
     * @type {Adapter}
     */
    adapter = null

    /**
     * @private
     * @type {AuthResolver}
     */
    authResolver = null

    /**
     * @private
     * @type {Array.<Protocol>}
     */
    protocols = null

    /**
     * @private
     * @type {Map.<string,Context>}
     */
    contexts = null

    /**
     * @private
     * @type {Map.<string,Stage>}
     */
    stages = null

    /**
     * @private
     * @type {Logger}
     */
    logger = null

    /**
     * 
     * @param {Adapter} adapter 
     * @param {AuthResolver} authResolver
     */
    constructor(adapter, authResolver) {
        this.adapter = adapter
        this.authResolver = authResolver || new AuthResolver()
        this.protocols = []
        this.contexts = new Map()
        this.stages = new Map()
        this.logging = new LoggingFactory()
        this.logger = this.logging.getLogger('rivalis')
    }

    run() {
        return this.adapter.initialize().then(() => {
            this.persistence = new NodePersistence(this.adapter)
            return this.persistence.initialize()
        }).then(() => {
            this.persistence.events.subscribe(this.handleEvent, this)
            this.logger.info('node is started successfully')
        })
    }

    /**
     * 
     * @returns {Promise.<void>}
     */
    shutdown() {
        this.persistence.events.unsubscribe(this.handleEvent, this)
        this.stages.clear()
        let promises = []
        this.contexts.forEach(context => promises.push(context.dispose()))
        this.protocols.forEach(protocol => promises.push(protocol.dispose()))
        return Promise.all(promises).then(() => {
            return this.persistence.dispose()
        }).then(() => {
            this.logger.info('node shutdown...')
            return this.adapter.dispose()
        })
    }

    /**
     * 
     * @param {string} contextId 
     * @param {string} type 
     * @returns {Promise.<void>}
     */
    create(contextId, type) {
        if (!this.stages.has(type)) {
            return Promise.reject(new Exception(`stage type=(${type}) is not defined`))
        }
        return this.persistence.contexts.savenx(contextId, { id: contextId, type }).then(persisted => {
            if (!persisted) {
                throw new Exception(`context=(${contextId}) already exist!`)
            }
            this.logger.trace(`context created id=(${contextId}) type=(${type})`)
        })
    }

    /**
     * 
     * @param {string} contextId 
     * @returns {Promise.<void>}
     */
    destroy(contextId) {
        return this.persistence.contexts.get(contextId).then(context => {
            if (context) {
                return this.persistence.events.emit({ key: 'destroy', data: contextId })
            }
            throw new Exception(`context=(${contextId}) doesn't exist!`)
        }).then(() => {
            return this.persistence.contexts.delete(contextId)
        }).then(() => {
            let persistence = new Persistence(contextId, this.adapter)
            this.logger.trace(`context destroyed id=(${contextId}) `)
            return persistence.clear()
        })
    }

    /**
     * 
     * @param {string} contextId
     * @returns {Promise.<Context>} 
     */
    obtain(contextId) {
        return this.persistence.contexts.get(contextId).then(context => {
            if (context === null) {
                throw new Exception(`context=(${contextId}) doesn't exist!`, Exception.Code.CONTEXT_NOT_EXIST)
            }
            const { id, type } = context
            if (!this.stages.has(type)) {
                throw new Exception(`stage=(${type}) is not available on this node`)
            }
            if (this.contexts.has(contextId)) {
                return null
            }
            let logger = this.logging.getLogger(`${type}:${id}`)
            let contextInstance = new Context(id, this.adapter, logger, this.stages.get(type))
            this.contexts.set(contextId, contextInstance)
            this.logger.trace(`context obtained id=(${contextId})`)
            return contextInstance.initialize()
        }).then(() => {
            return this.contexts.get(contextId)
        })
    }

    /**
     * 
     * @param {string} type 
     * @param {Stage} stage
     * @returns {this} 
     */
    define(type, stage) {
        if (this.stages.has(type)) {
            throw new Exception(`stage=(${type}) already exist!`)
        }
        this.stages.set(type, stage)
        return this
    }

    /**
     * 
     * @param {Protocol} protocol 
     * @returns {this}
     */
    enable(protocol) {
        Protocol.setRivalis(protocol, this)
        return Protocol.handle(protocol)
    }

    /**
     * 
     * @returns {Promise.<Array.<Object.<string,any>>>}
     */
    getAll() {
        return this.persistence.contexts.getAll().then(contexts => {
            let list = []
            contexts.forEach(context => list.push(context))
            return list
        })
    }

    /**
     * @private
     * @param {Object.<string,any>} event 
     */
    handleEvent({ key, data }) {
        this.logger.trace(key, data)
        if (key === 'destroy') {
            let context = this.contexts.get(data)
            if (context) {
                context.dispose().then(() => {
                    this.contexts.delete(context.id)
                })
            }
        }
    }

}

/**
 * 
 * @param {Rivalis} rivalis 
 * @returns {AuthResolver}
 */
Rivalis.getAuthResolver = rivalis => {
    return rivalis.authResolver
}

export default Rivalis

