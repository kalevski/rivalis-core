import EventEmitter from 'eventemitter3'
import Event from './Event'
import Adapter from '../interfaces/Adapter'
import VectorClock from '../structs/VectorClock'
import ActorService from '../services/ActorService'
import ActionService from '../services/ActionService'
import EventService from '../services/EventService'
import DataStorage from '../persistence/DataStorage'
import ContextSync from '../persistence/ContextSync'
import Stage from './Stage'
import Logger from './Logger'
import Activity from './Activity'

/**
 * @callback StateListener
 * @param {Object.<string,any>} event
 */


/**
 * @class
 */
class Context {

    /**
     * unique context identifier
     * @type {string}
     */
    id = null

    /**
     * provides API for managing actors of the context
     * @type {ActorService}
     */
    actors = null

    /**
     * provides API for managing actions of the context
     * @type {ActionService}
     */
    actions = null

    /**
     * provides API for managing events of the context
     * @type {EventService}
     */
    events = null

    /**
     * @readonly
     * @type {VectorClock}
     */
    clock = null

    /**
     * @private
     * @type {ContextSync}
     */
    sync = null

    /**
     * @private
     * @type {EventEmitter}
     */
    emitter = null

    /**
     * @private
     * @type {Stage}
     */
    stage = null

    /**
     * @private
     * @type {Logger}
     */
    logger = null

    /**
     * @private
     * @type {Activity}
     */
    activity = null

    /**
     * 
     * @license {@link https://github.com/rivalis/rivalis-core/blob/main/LICENSE}
     * @author Daniel Kalevski
     * @since 0.5.0
     * 
     * Context instance represents space where your actors and business logic are alive.
     * It is responsible for providing API for managing actors, actions, events, activities and emitting states.
     * Context instance must be initialized before using.
     * 
     * @param {string} id unique context identifier
     * @param {Adapter} adapter adapter used for storing and sharing data
     * @param {Logger} logger logger instace for logging state and actions of the context
     * @param {Stage} [stage=null] stage used for handling events
     */
    constructor(id, adapter, logger, stage = null) {
        this.id = id
        this.stage = stage ? stage : new Stage()
        this.logger = logger
        this.activity = new Activity()
        this.clock = new VectorClock(id)
        this.sync = new ContextSync(id, adapter)
        this.emitter = new EventEmitter()
    }

    /**
     * Context#initialize method must be invoked before using the context instance.
     * This method starts the important instance procedures.
     * @returns {Promise.<void>}
     */
    initialize() {
        return this.sync.initialize().then(() => {
            this.sync.events.subscribe(this.handleEvent, this)
            this.sync.state.subscribe(this.handleState, this)

            this.actors = new ActorService(this, this.sync, this.stage)
            this.actions = new ActionService(this)
            this.events = new EventService(this, this.sync)
            return this.stage.onInit(this)
        }).then(() => {
            this.emitter.emit(Context.State.INIT, this)
            this.logger.info('context succesfully initialized')
        })
    }

    /**
     * Context#dispose method can be used to dispose the context and all inner procedures
     * @returns {Promise.<void>}
     */
    dispose() {
        return ActorService.dispose(this.actors).then(() => {
            return this.stage.onDispose(this)
        }).then(() => {
            
            this.sync.events.unsubscribe(this.handleEvent, this)
            this.sync.state.unsubscribe(this.handleState, this)
            
            this.actors = null
            this.actions = null
            this.events = null

            return this.sync.dispose()
        }).then(() => {
            this.emitter.emit(Context.State.DISPOSE, this)
            this.emitter.removeAllListeners()
            this.emitter = null
            this.sync = null
            this.logger.info('context succesfully disposed')
        })
    }

    /**
     * provides shared storage on context level
     * @type {DataStorage}
     */
    get data() {
        return this.sync.data
    }

    /**
     * Context#use can be used to add activity to the context
     * @param {string} key 
     * @param {Activity} activity 
     * @returns 
     */
    use(key, activity) {
        return this.activity.use(key, activity)
    }

    /**
     * Context#on method can be used for registring a listener on any context state
     * possible context states are listed under Context.State enumeration
     * @param {string} state 
     * @param {StateListener} stateListener 
     * @param {any} context 
     * @returns {this}
     */
    on(state, stateListener, context) {
        this.emitter.on(state, stateListener, context)
        return this
    }

    /**
     * Context#off method can be used for removing already registered listener
     * @param {string} state 
     * @param {StateListener} stateListener 
     * @param {any} context 
     * @returns 
     */
    off(state, stateListener, context) {
        this.emitter.off(state, stateListener, context)
        return this
    }

    /**
     * @private
     * @param {Event} event 
     */
    handleEvent(event) {
        this.clock.update(event.getVectorClock())
        this.logger.trace('event emitted', event)
        this.stage.onEmit(this, event)
        this.emitter.emit(Context.State.EMIT, event)
    }

    /**
     * @private
     * @param {Object.<string,any>} state 
     */
    handleState(state) {
        const { key, data } = state
        this.logger.trace(key, data)
        this.emitter.emit(key, data)
    }
}

/**
 * @enum {string}
 */
Context.State = {
    ACTOR_JOIN: 'actor.join',
    ACTOR_LEAVE: 'actor.leave',
    ACTOR_KICK: 'actor.kick',

    INIT: 'init',
    DISPOSE: 'dispose',
    EMIT: 'emit'
}

/**
 * 
 * @param {Context} context 
 * @returns {ContextSync}
 */
Context.getSync = context => {
    return context.sync
}

/**
 * 
 * @param {Context} context 
 * @returns {Logger}
 */
Context.getLogger = context => {
    return context.logger
}

export default Context