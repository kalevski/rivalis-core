import Config from './Config'
import ContextPool from './core/StageProvider'
import ContextProvider from './core/ContextProvider'
import ActionHandlerGroup from './core/ActionHandlerGroup'
import SlotProvider from './core/SlotProvider'

class Rivalis {

    /**
     * 
     * @type {ContextProvider}
     */
    contexts = null

    /**
     * 
     * @type {ActionHandlerGroup}
     */
    actions = null

    /**
     * 
     * @type {ContextPool}
     */
    pool = null

    /**
     * 
     * @type {SlotProvider}
     */
    slots = null

    /**
     * 
     * @private
     * @type {Config}
     */
    config = null

    /**
     * 
     * @param {Config} config 
     */
    constructor(config = {}) {
        this.config = new Config(config)
        this.contexts = new ContextProvider(this.config)
        this.actions = new ActionHandlerGroup()
        this.pool = new ContextPool(this.config, this.contexts, this.actions)
        this.slots = new SlotProvider(this.config, this.contexts)
    }

    initialize() {
        try {
            this.config.validate()
        } catch (error) {
            return Promise.reject(new Error(`rivalis can not be initialized, reason: ${error.message}`))
        }
        return this.config.adapters.kvStorage.initalize().then(() => {
            this.config.adapters.listStorage.initalize()
        }).then(() => {
            this.config.adapters.messaging.initalize()
        }).then(() => {
            const promises = []
            for (let connector of this.config.connectors) {
                const promise = connector.initalize(this)
                promises.push(promise)
            }
            return Promise.all(promises)
        })
    }
}

export default Rivalis