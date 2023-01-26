import TS from "./ts";

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["resume"] }] */
export default class AjaxSource {
  request: null | XMLHttpRequest;
  url: string;
  destination: null | TS;
  streaming: boolean;
  completed: boolean;
  established: boolean;
  progress: number;
  onEstablishedCallback: Function;
  onCompletedCallback: Function;
  hookOnEstablished: Function;

  constructor(url, options) {
    this.url = url;
    this.destination = null;
    this.request = null;
    this.streaming = false;

    this.completed = false;
    this.established = false;
    this.progress = 0;

    this.onEstablishedCallback = options.onSourceEstablished;
    this.onCompletedCallback = options.onSourceCompleted;

    if (options.hookOnEstablished) {
      this.hookOnEstablished = options.hookOnEstablished;
    }
  }

  connect(destination) {
    this.destination = destination;
  }

  start() {
    this.request = new XMLHttpRequest();

    // eslint-disable-next-line func-names
    this.request.onreadystatechange = function () {
      if (this.request.readyState === this.request.DONE && this.request.status === 200) {
        this.onLoad(this.request.response);
      }
    }.bind(this);

    this.request.onprogress = this.onProgress.bind(this);
    this.request.open('GET', this.url);
    this.request.responseType = 'arraybuffer';
    this.request.send();
  }

  resume() {
    // Nothing to do here
  }

  destroy() {
    if (this.request !== null) this.request.abort();
  }

  onProgress(ev) {
    this.progress = ev.loaded / ev.total;
  }

  onLoad(data) {
    this.established = true;
    this.completed = true;
    this.progress = 1;

    if (this.hookOnEstablished) {
      this.hookOnEstablished();
    }

    if (this.onEstablishedCallback) {
      this.onEstablishedCallback(this);
    }
    if (this.onCompletedCallback) {
      this.onCompletedCallback(this);
    }

    if (this.destination) {
      this.destination.write(data);
    }
  }
}
