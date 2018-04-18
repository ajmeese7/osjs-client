/*
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) 2011-2018, Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

import Application from './application';
import {style, script} from './utils/dom';

/**
 * A registered package reference
 * @property {Object} metadata Package metadata
 * @property {Function} callback Callback to instanciate
 * @typedef PackageReference
 */

/**
 * A package metadata
 * @property {String} name The package name
 * @property {String} [category] Package category
 * @property {String} [icon] Package icon
 * @property {String} [server] Server script filename
 * @property {String[]} [files] Files to preload
 * @property {Map<String, String>} title A map of locales and titles
 * @property {Map<String, String>} description A map of locales and titles
 * @typedef PackageMetadata
 */

/*
 * Fetch package manifest
 */
const fetchManifest = async (core) => {
  const response = await fetch(core.url('/metadata.json'));
  const metadata = await response.json();

  return metadata;
};

/**
 * Package Manager
 *
 * @desc Handles indexing, loading and launching of OS.js packages
 */
export default class Packages {

  /**
   * Create package manage
   *
   * @param {Core} core Core reference
   */
  constructor(core) {
    /**
     * Core instance reference
     * @type {Core}
     */
    this.core = core;

    /**
     * A list of registered packages
     * @type {PackageReference[]}
     */
    this.packages = [];

    /**
     * The lost of loaded package metadata
     * @type {PackageMetadata[]}
     */
    this.metadata = [];

    /**
     * A list of cached preloads
     * @type {String[]}
     */
    this.loaded = [];

    /**
     * A list of running application names
     * @desc Mainly used for singleton awareness
     * @type {String[]}
     */
    this.running = [];
  }

  /**
   * Destroy package manager
   */
  destroy() {
    this.packages = [];
    this.metadata = [];
  }

  /**
   * Initializes package manager
   */
  async init() {
    console.debug('Packages::init()');

    this.metadata = await fetchManifest(this.core);
  }

  /**
   * Loads all resources required for a package
   * @param {Array} list A list of resources
   * @param {Boolean} [force=false] Force loading even though previously cached
   * @return {String[]} A list of failed resources
   */
  async preload(list, force = false) {
    const root = this.core.$resourceRoot;

    console.debug('Packages::preload()');

    const getSource = entry => this.core.config('development')
      ? entry + '?_time=' + (new Date()).getTime()
      : entry;

    let failed = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const cached = this.loaded.find(src => src === entry);

      if (!force && cached) {
        continue;
      }

      console.debug('Packages::preload()', entry);

      try {
        const el = entry.match(/\.js$/)
          ? await script(root, getSource(entry))
          : await style(root, getSource(entry));

        if (!cached) {
          this.loaded.push(entry);
        }

        console.debug('=>', el);
      } catch (e) {
        failed.push(entry);
        console.warn(e);
      }
    }

    return failed;
  }

  /**
   * Launches a (application) package
   *
   * @param {String} name Package name
   * @param {Object} [args] Launch arguments
   * @param {Object} [options] Launch options
   * @param {Boolean} [options.forcePreload=false] Force preload reloading
   * @see PackageServiceProvider
   * @throws {Error}
   * @return {Promise<Application, Error>}
   */
  launch(name, args = {}, options = {}) {
    console.debug('Packages::launch()', name, args, options);

    const metadata = this.metadata.find(pkg => pkg.name === name);
    if (!metadata) {
      throw new Error(`Package Metadata ${name} not found`);
    }

    this.core.emit('osjs/application:launch', name, args, options);

    if (metadata.singleton) {
      const found = this.running.filter(n => n === name);

      if (found.length > 0) {
        return new Promise((resolve, reject) => {
          this.core.on('osjs/application:launched', (n, a) => {
            if (n === name) {
              a.emit('attention', args, options);
              resolve(a);
            }
          });
        });
      }
    }

    this.running.push(name);

    return this._launch(name, metadata, args, options);
  }

  /**
   * Wrapper for launching a (application) package
   *
   * @param {String} name Package name
   * @param {Object} args Launch arguments
   * @param {Object} options Launch options
   * @return {Application}
   */
  async _launch(name, metadata, args, options) {
    const fail = err => {
      this.core.emit('osjs/application:launched', name, false);
      throw new Error(err);
    };

    const basePath = this.core.config('public');
    const errors = await this.preload(
      metadata.files
        .map(f => this.core.url(`${basePath}apps/${metadata._path}/${f}`)),
      options.forcePreload === true
    );
    if (errors.length) {
      fail(`Package Loading ${name} failed: ${errors.join(', ')}`);
    }

    const found = this.packages.find(pkg => pkg.metadata.name === name);
    if (!found) {
      fail(`Package Runtime ${name} not found`);
    }

    let app;

    try {
      console.group('Packages::_launch()');
      app = found.callback(this.core, args, options, found.metadata);

      if (app instanceof Application) {
        app.on('destroy', () => {
          const foundIndex = this.running.findIndex(n => n === name);
          if (foundIndex !== -1) {
            this.running.splice(foundIndex, 1);
          }
        });
      }
    } catch (e) {
      // TODO
      console.warn(e);
    } finally {
      this.core.emit('osjs/application:launched', name, app);
      console.groupEnd();
    }

    return app;
  }

  /**
   * Registers a package
   *
   * @param {String} name Package name
   * @param {Function} callback Callback function to construct application instance
   * @throws {Error}
   */
  register(name, callback) {
    console.debug('Packages::register()', name);

    const metadata = this.metadata.find(pkg => pkg.name === name);
    if (!metadata) {
      throw new Error(`Metadata not found for ${name}. Is it in the manifest ?`);
    }

    this.packages.push({
      metadata,
      callback
    });
  }
}
