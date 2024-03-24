import * as path from "path"
import { PLUGIN_NAME } from "./static"
import { HistoryFileViewAction,  PocketSettings } from "d"


export class Pocket {
  prefix: string = 'snowflake_obsidian'
  constructor(settings?: PocketSettings) {
    this.prefix = settings?.prefix || this.prefix
  }
  get(key: string): string | null {
    return localStorage.getItem(this.prefix + key)
  }
  set(key: string, value: string | number | null) {
    localStorage.setItem(this.prefix + key, `${value}`)
  }
  clear(key: string) {
    localStorage.removeItem(this.prefix + key)
  }
  clear_all() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(this.prefix))
        localStorage.removeItem(key)
    }
  }
}

export class FileMetaData {
  path: string = ''
  config_dir: string = '.obsidian'
  ext_path: () => string = () => `${this.config_dir}/plugins/${PLUGIN_NAME}`
  filename: string
  lines_limit: number = 500
  current_lines_pointer: number = 0
  callback: (...args: any[]) => void
  constructor(filename: string, config_dir: string = '.obsidian') {
    this.filename = filename
    this.config_dir = config_dir
    if (typeof process === 'object')
      this.path = path.join(this.ext_path(), this.filename)
    else
      this.path = [this.ext_path(), this.filename].join('/')
  }
  set_main_path() {
    if (typeof process === 'object')
      this.path = path.join(this.ext_path(), this.filename)
    else
      this.path = [this.ext_path(), this.filename].join('/')
  }
  set_limit(limit: number) {
    this.lines_limit = limit
  }
  set_callback(callback: (...args: any[]) => void) {
    this.callback = callback
  }
  set_config_dir(config_dir: string) {
    this.config_dir = config_dir
  }
  create() {
    try {
      app.vault.adapter.write(this.path, '')
    } catch {
      console.log('Error: Write File')
    }
  }
  async set(value: string) {
    try {
      await app.vault.adapter.write(this.path, value)
    } catch {
      console.log('Error: Write File Sync')
    }
  }
  async add(value: string) {
    try {
      await app.vault.adapter.append(this.path, value)
    } catch {
      console.log('Error: Append File Sync')
    }
  }
  async get() {
    try {
      return await app.vault.adapter.read(this.path)
    } catch (err) {
      console.log('Error: Read File Sync - ' + err.message)
      return ''
    }
  }
  /**
   *  returns `count` of lines from `start` value.
   * `start` could be also less then `0`, then `count` will be get by the end of the file
   * 
   * @param start 
   * @param count 
   * @returns 
*/
  async get_lines_by_index(start: number, count?: number) {
    const file = await this.get()
    const lines = file.toString().split('\n')
    const len = lines.length
    if (start > len) return []
    if (!count) count = len
    if (start < 0)
      start = len + start
    if (start < 0)
      start = 0
    if (start + count >= len)
      count = len
    else
      count = start + count
    this.current_lines_pointer = len

    return lines.slice(start, count).filter(item => !!item)
  }
  async get_lines_from_to_phrase(phrase: string, count: number = 1, contain_phrase = false, reverse: boolean = true) {
    const file = await this.get()
    const lines = file.toString().split('\n').reverse()
    const len = lines.length
    const lines_to_return = []
    for (let line of lines) {
      if (line.contains(phrase)) {
        if (contain_phrase)
          lines_to_return.push(line)
        count--
      } else {
        lines_to_return.push(line)
      }

      if (count == 0)
        break
    }
    this.current_lines_pointer = len

    return lines_to_return.filter(item => !!item)
  }
}

export class Logger extends FileMetaData {
  constructor(filename: string, config_dir: string = '.obsidian') {
    super(filename, config_dir)
  }
  async check_limit() {
    if (this.current_lines_pointer > 0.9 * this.lines_limit) {
      const start = 0.1 * this.lines_limit
      await this.set((await this.get_lines_by_index(-start)).join('\n'))
      this.current_lines_pointer = start
    }
  }

  async log(message: string) {
    const date = new Date()
    const fullmessage = `\n[${date.toLocaleString().replace(', ', '|')}]>\t${message}`
    await this.add(fullmessage)
    if (this.callback)
      this.callback(fullmessage)
    this.current_lines_pointer++
    await this.check_limit()
  }
}

export class History extends FileMetaData {
  lines_limit: number = 2000
  current_lines_pointer: number = 0
  callback: (...args: any[]) => void
  constructor(filename: string, config_dir: string = '.obsidian') {
    super(filename, config_dir)
  }
  async check_limit() {
    if (this.current_lines_pointer > 0.9 * this.lines_limit) {
      const start = 0.3 * this.lines_limit
      await this.set((await this.get_lines_by_index(-start)).join('\n'))
      this.current_lines_pointer = start
    }
  }

  parser(line: string) {
    const [time, action, path, old_path] = line.split('\t')
    return {
      time, action, path, old_path
    }
  }
  async clear() {
    await this.set('')
    this.current_lines_pointer = 0
  }
  async check_repeats(_action: string, _path: string) {
    const last_changes = await this.get_lines_by_index(-200)
    for (const item of last_changes) {
      const { action, path } = this.parser(item)
      if (action == 'MODIFY' && _action == action && path == _path)
        return false
    }
    return true
  }
  async add_action(action: HistoryFileViewAction, path: string, old_path?: string) {
    const date = new Date()
    if (!(await this.check_repeats(action, path))) return
    const fullmessage = `\n[${date.toLocaleString()}]\t${action}\t${path}\t${old_path || 'null'}`
    await this.add(fullmessage)
    if (this.callback)
      this.callback(fullmessage)
    this.current_lines_pointer++
    await this.check_limit()
  }
}
