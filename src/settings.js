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

import {resolveTreeByKey} from './utils/config';

const localStorageAdapter = {
  save(settings) {
    Object.keys(settings).forEach((k) => {
      console.error(k, settings[k], JSON.stringify(settings[k]));
      localStorage.setItem(k, JSON.stringify(settings[k]));
    });
  },

  load() {
    return Object.keys(localStorage).reduce((o, v) => {
      let value = localStorage.getItem(v);
      try {
        value = JSON.parse(value);
      } catch (e) {}

      return Object.assign(o, {[v]: value});
    }, {});
  }
};

/**
 * Settings Handler
 *
 * @desc Handles Settings
 */
export default class Settings {

  /**
   * Creates the Settings Handler
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
     * Internal timeout reference used for debouncing
     * @type {Object}
     */
    this.debounce = null;

    /**
     * The settings tree
     * @type {Object}
     */
    this.settings = {};
  }

  /**
   * Saves Settings
   * @return {Promise<Boolean, Error>}
   */
  save() {
    return new Promise((resolve) => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => {
        localStorageAdapter.save(this.settings);
        resolve(true);
      }, 100);
    });
  }

  /**
   * Loads Settings
   * @return {Promise<Boolean, Error>}
   */
  load() {
    return new Promise((resolve) => {
      this.settings = localStorageAdapter.load();
      resolve();
    });
  }

  /**
   * Gets a settings entry by key
   *
   * @param {String} key The key to get the value from
   * @param {*} [defaultValue] If result is undefined, return this instead
   * @see {resolveTreeByKey}
   * @return {*}
   */
  get(key, defaultValue) {
    return resolveTreeByKey(this.settings, key, defaultValue);
  }

  /**
   * Sets a settings entry by root key
   * @param {String} key The key to set
   * @param {*} value The value to set
   * @return {Settings} This
   */
  set(key, value) {
    this.settings[key] = value;

    return this;
  }

}