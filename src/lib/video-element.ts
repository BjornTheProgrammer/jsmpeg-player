// utils
import isString from '@cycjimmy/awesome-js-funcs/esm/judgeBasic/isString';
import functionToPromise from '@cycjimmy/awesome-js-funcs/esm/typeConversion/functionToPromise';

// style
import _style from '../theme/style.scss';
// button view
import { PLAY_BUTTON, UNMUTE_BUTTON } from '../buttonView';

// service
import Player from './player';
import MP2WASM from './mp2-wasm';
import MP2 from './mp2';

export interface Hook {
  play?: Function;
  pause?: Function;
  stop?: Function;
  load?: Function;
  destroy?: Function;
}

export interface Options {
  videoWrapper?: string | Element;
  videoUrl?: string;
  canvas?: HTMLCanvasElement | string;
  poster?: string;
  picMode?: boolean;
  autoplay?: boolean;
  autoSetWrapperSize?: boolean;
  loop?: boolean;
  control?: boolean;
  decodeFirstFrame?: boolean;
  progressive?: boolean;
  chunkSize?: number;
  hooks?: Hook;
  needPlayButton?: boolean;
  hookOnEstablished?: Function;
  source?: any;
  streaming?: boolean;
  maxAudioLag?: number;
  disableWebAssembly?: boolean;
  video?: boolean;
  disableGl?: boolean;
  audio?: boolean;
  wasmModule?: any;
  pauseWhenHidden?: boolean;
  onPause?: Function;
  onEnded?: Function;
  onStalled?: Function;
  videoBufferSize?: number;
  audioBufferSize?: number;
  onVideoDecode?: Function;
  onAudioDecode?: Function;
  onPlay?: Function;
  onSourceEstablished?: Function;
  onSourceCompleted?: Function;
  preserveDrawingBuffer?: boolean;
  throttled?: boolean;

}

interface Wrapper extends Element {
  clientRect?: DOMRect;
  playerInstance?: Player | null;
}

interface Els {
  wrapper: Wrapper;
  canvas: null | Element | string;
  playButton: HTMLDivElement;
  unmuteButton: null | HTMLDivElement;
  poster: null | Element & { src?: string};
  src?: string;
}

export default class VideoElement {
  options: Options;
  player?: null | Player;
  els: Els;
  play: Function;
  pause: Function;
  stop: Function;
  destroy: Function;
  unlockAudioBound?: EventListener;

  constructor(
    wrapper: string | Element,
    videoUrl: string,
    {
      canvas = '',
      poster = '',
      autoplay = false,
      autoSetWrapperSize = false,
      loop = false,
      control = true,
      decodeFirstFrame = true,
      picMode = false,
      progressive = true,
      chunkSize = 1024 * 1024,
      hooks = {},
    }: Options = {},
    overlayOptions: Options = {},
  ) {
    this.options = {
      videoUrl,
      canvas,
      poster,
      picMode,
      autoplay,
      autoSetWrapperSize,
      loop,
      control,
      decodeFirstFrame,
      progressive,
      chunkSize,
      hooks: {
        play: () => {},
        pause: () => {},
        stop: () => {},
        load: () => {},
        ...hooks,
      },
      ...overlayOptions,
    };

    this.options.needPlayButton = this.options.control && !this.options.picMode;

    this.player = null;

    // Setup canvas and play button
    this.els = {
      wrapper: isString(wrapper) ? document.querySelector(wrapper as string) : wrapper as Element,
      canvas: null,
      playButton: document.createElement('div'),
      unmuteButton: null,
      poster: null,
    };

    if (window.getComputedStyle(this.els.wrapper).getPropertyValue('position') === 'static') {
      this.els.wrapper.style.position = 'relative';
    }

    this.els.wrapper.clientRect = this.els.wrapper.getBoundingClientRect();

    this.initCanvas();
    this.initPlayButton();
    this.initPlayer();
  }

  initCanvas() {
    if (this.options.canvas) {
      this.els.canvas = isString(this.options.canvas)
        ? document.querySelector(this.options.canvas as string)
        : this.options.canvas;
    } else {
      this.els.canvas = document.createElement('canvas');
      this.els.canvas.classList.add(_style.canvas);
      this.els.wrapper.appendChild(this.els.canvas);
    }
  }

  initPlayer() {
    // Parse the data-options - we try to decode the values as json. This way
    // we can get proper boolean and number values. If JSON.parse() fails,
    // treat it as a string.
    this.options = Object.assign(this.options, {
      canvas: this.els.canvas,
    });

    // eslint-disable-next-line no-underscore-dangle
    const _options = { ...this.options, autoplay: false };

    // Create the player instance
    this.player = new Player(this.options.videoUrl, _options, {
      play: () => {
        if (this.options.needPlayButton) {
          this.els.playButton.classList.add(_style.hidden);
        }

        if (this.els.poster) {
          this.els.poster.classList.add(_style.hidden);
        }

        if (this.options?.hooks?.play) this.options.hooks.play();
      },
      pause: () => {
        if (this.options.needPlayButton) {
          this.els.playButton.classList.remove(_style.hidden);
        }

        if (this.options?.hooks?.pause) this.options.hooks.pause();
      },
      stop: () => {
        if (this.els.poster) {
          this.els.poster.classList.remove(_style.hidden);
        }

        if (this.options?.hooks?.stop) this.options.hooks.stop();
      },
      load: () => {
        if (this.options.autoplay) {
          this.play();
        }

        this._autoSetWrapperSize();
        if (this.options?.hooks?.load) this.options.hooks.load();
      },
    });

    this._copyPlayerFuncs();
    this.els.wrapper.playerInstance = this.player;

    // Setup the poster element, if any
    if (this.options.poster && !this.options.autoplay && !this.player.options.streaming) {
      this.options.decodeFirstFrame = false;
      this.els.poster = new Image();
      this.els.poster.src = this.options.poster;
      this.els.poster.classList.add(_style.poster);
      this.els.wrapper.appendChild(this.els.poster);
    }

    // Add the click handler if this video is pausable
    if (!this.player.options.streaming) {
      this.els.wrapper.addEventListener('click', this.onClick.bind(this));
    }

    // Hide the play button if this video immediately begins playing
    if (this.options.autoplay || this.player.options.streaming) {
      this.els.playButton.classList.add(_style.hidden);
    }

    // Set up the unlock audio button for iOS devices. iOS only allows us to
    // play audio after a user action has initiated playing. For autoplay or
    // streaming players we set up a muted speaker icon as the button. For all
    // others, we can simply use the play button.
    if (this.player.audioOut && !this.player.audioOut.unlocked) {
      let unlockAudioElement = this.els.wrapper;

      if (this.options.autoplay || this.player.options.streaming) {
        this.els.unmuteButton = document.createElement('div');
        this.els.unmuteButton.innerHTML = UNMUTE_BUTTON;
        this.els.unmuteButton.classList.add(_style.unmuteButton);
        this.els.wrapper.appendChild(this.els.unmuteButton);
        unlockAudioElement = this.els.unmuteButton;
      }

      this.unlockAudioBound = this.onUnlockAudio.bind(this, unlockAudioElement);
      if (this.unlockAudioBound) {
        unlockAudioElement.addEventListener('touchstart', this.unlockAudioBound, false);
        unlockAudioElement.addEventListener('click', this.unlockAudioBound, true);
      }
    }
  }

  initPlayButton() {
    if (!this.options.needPlayButton) {
      return;
    }

    this.els.playButton.classList.add(_style.playButton);
    this.els.playButton.innerHTML = PLAY_BUTTON;
    this.els.wrapper.appendChild(this.els.playButton);
  }

  _autoSetWrapperSize() {
    if (!this.options.autoSetWrapperSize || !this.player?.video) {
      return Promise.resolve();
    }

    const { destination } = this.player.video;

    if (!destination) {
      return Promise.resolve();
    }

    return Promise.resolve().then(() => functionToPromise(() => {
      this.els.wrapper.style.width = `${destination.width}px`;
      this.els.wrapper.style.height = `${destination.height}px`;
    }));
  }

  onUnlockAudio(element, ev) {
    if (this.els.unmuteButton) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    if (!this.player?.video) return;
    this.player.audioOut.unlock(() => {
      if (this.els.unmuteButton) {
        this.els.unmuteButton.classList.add(_style.hidden);
      }
      element.removeEventListener('touchstart', this.unlockAudioBound);
      element.removeEventListener('click', this.unlockAudioBound);
    });
  }

  onClick() {
    if (!this.options.control) {
      return;
    }

    if (this.player?.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * copy player functions
   * @private
   */
  _copyPlayerFuncs() {
    this.play = () => this.player!.play();
    this.pause = () => this.player!.pause();
    this.stop = () => this.player!.stop();
    this.destroy = () => {
      if (this.player?.destroy) this.player.destroy();
      this.els.wrapper.innerHTML = '';
      this.els.wrapper.playerInstance = null;
    };
  }
}
