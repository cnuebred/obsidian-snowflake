import { App, Notice, arrayBufferToBase64 } from 'obsidian'
import axios from 'axios'
import { pocket } from 'main'

export type GitLabSnippetFileAction = 'create' | 'update' | 'delete' | 'move'
export type GitLabOptions = {
  api: string
  token: string,
  project: string,
  repository: string,
  email: string,
  nick: string,
  branch: string,
  notifications: boolean
}
export type GitLabCommitOptions = {
  branch?: string,
  encoding?: string,
  author_email?: string,
  author_name?: string,
  commit_message?: string
}
export type GitLabSnippetFile = {
  action: GitLabSnippetFileAction
  file_path: string
  content: string
  previous_path?: string
}
export type GitLabSnippetFileOptional = {
  action?: GitLabSnippetFileAction
  file_path?: string
  content?: string
  previous_path?: string
}
export type GitLabSnippetDoc = {
  title: string
  description: string
  visibility: string
  files: GitLabSnippetFile[]
}
export type GitLabSnippetDocOptional = {
  title?: string
  description?: string
  visibility?: string
  files?: GitLabSnippetFile[]
}

export type GitlabCommit = {
  id: string,
  short_id: string,
  created_at: Date,
  parent_ids: string,
  title: string,
  message: string,
  author_name: string,
  author_email: string,
  authored_date: Date,
  committer_name: string,
  committer_email: string,
  committed_date: Date,
  trailers: any,
  extended_trailers: any,
  web_url: string,
  stats: {
    additions: number,
    deletions: number,
    total: number
  },
  status: any,
  project_id: number,
  last_pipeline: any
}

const urlslash = (...text: string[]): string => {
  const path = text.join('/')
  const end = path.slice(path.lastIndexOf('/'))
  const start = path.slice(0, path.lastIndexOf('/')).replace(/\./gm, '%2E')
  return (start + end).replace(/\//gm, '%2F')
}
function base64ToArrayBuffer(base64: string) {
  var binaryString = atob(base64);
  var bytes = new Uint8Array(binaryString.length);
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}


const exurl = (_url: string, _params_no: number = 0) => ({
  base: (url: string) => exurl(_url + url, _params_no),
  add: (key: string, value: string) => exurl(_url + (_params_no == 0 ? '?' : '&') + `${key}=${value}`, _params_no + 1),
  params: (key: string, value: string) => exurl(_url.replace(`:${key}`, value), _params_no),
  value: _url
})

type ExUrl = ReturnType<typeof exurl>

export class GitLabAPI {
  options: GitLabOptions
  constructor() {
  }
  setoptions(options: GitLabOptions) {
    this.options = options
  }
  id = () => urlslash(this.options.project, this.options.repository)
  header = () => {
    return {
      'PRIVATE-TOKEN': this.options.token,
      'Content-Type': 'application/json'
    }
  }
  url = {
    commits: () => exurl(`${this.options.api}/projects/${this.id()}/repository/commits`),
    branches: () => exurl(`${this.options.api}/projects/${this.id()}/repository/branches`),
    files: () => exurl(`${this.options.api}/projects/${this.id()}/repository/files`)
  }
  async get_local_file(path: string): Promise<string> {
    const array_buffer = await app.vault.adapter.readBinary(path)
    return arrayBufferToBase64(array_buffer)
  }
  async save_local_file(remote_path: string, local_path?: string, create_if_not_exist: boolean = false): Promise<void> {
    if (!local_path) local_path = remote_path
    const remote_file = await this.read(remote_path)
    if (!remote_file) {
      if (create_if_not_exist)
        this.create(remote_path)
    }
    else
      app.vault.adapter.writeBinary(local_path, base64ToArrayBuffer(remote_file.data.content))
  }
  async get_branches() {
    const url = this.url.branches()
      .add('pt', 'null')

    const res: any[] = []
    try {
      await this.pagination(1, url, async (res_item) => {
        res.push(...res_item.data.map((item: any) => item.name))
      })
    } catch (e) {
      new Notice(`Cannot get branches\n${url.value}`)
    }
    return res
  }
  async create_branch(branch: string, parent_branch: string) {
    const url = this.url.branches()
      .add('branch', urlslash(branch))
      .add('ref', urlslash(parent_branch))
      .value

    const res: any[] = []
    try {
      await axios.post(url, null, {
        headers: this.header()
      })
    } catch (e) {
      new Notice(`Error while creating branch\n${url}`)
    }
    return res
  }
  async save_last_commit() {
    const url = this.url.commits()
      .add('with_stats', 'true')
      .add('all', 'true')
      .add('per_page', '3')
      .value
    const res = await axios.get(url, {
      headers: this.header()
    })
    const last_commit = res.data.pop()
    pocket.set('last_commit_id', last_commit.id)
    pocket.set('last_commit_date', last_commit.committed_date)
  }
  convertToGitlabCommit(data: any): GitlabCommit {
    return {
      ...data,
      created_at: new Date(data.created_at),
      authored_date: new Date(data.authored_date),
      committed_date: new Date(data.committed_date),
    };
  }
  async get_commit(sha: string): Promise<GitlabCommit | null> {
    const url = this.url.commits()
      .base('/' + sha)
    try {
      const res = await axios.get(url.value, {
        headers: this.header(),
      })
      return this.convertToGitlabCommit(res.data)
    } catch (e) {
      new Notice(`Cannot get commit\n${url.value}`)
    }
    return null
  }
  async get_commits() {
    const url = this.url.commits()
      .add('with_stats', 'true')
      .add('all', 'true')
      .add('ref_name', this.options.branch)
      .add('since', pocket.get('last_commit_date') || new Date().toISOString())


    const res: any[] = []
    try {
      await this.pagination(1, url, (res_item) => {
        res.push(...res_item.data)
      })
    } catch (e) {
      new Notice(`Cannot get commits\n${url.value}`)
    }
    return res
  }
  async get_all_commits() {
    const url = this.url.commits()
      .add('with_stats', 'true')
      .add('ref_name', this.options.branch)
      .add('all', 'true')

    const res: any[] = []
    try {
      await this.pagination(1, url, (res_item) => {
        res.push(...res_item.data)
      })
    } catch (e) {
      new Notice(`Cannot get commits\n${url.value}`)
    }
    return res
  }
  async get_meta_data_file(path: string) {
    const url = this.url.files().base(`/${urlslash(path)}`)
      .add('ref', this.options.branch)

    try {
      return await axios.head(url.value, {
        headers: this.header(),
      })
    } catch (e) {
      new Notice(`Cannot get file header\n${url.value}`)
    }
    return null
  }
  async pagination(start_page: number, url: ExUrl, callback: (res: any) => void, per_page: number = 100) {
    const page_url = url.add('per_page', per_page.toString()).add('page', start_page.toString())
    const res = await axios.get(page_url.value, { headers: this.header() })
    if (res.data?.length == 0) return
    await callback(res)
    await this.pagination(start_page + 1, url, callback, per_page)
  }
  async get_diffs(commit_id: string) {
    const url = this.url.commits()
      .base(`${commit_id}/diff`)
      .value
    let res = null
    try {
      res = await axios.get(url, { headers: this.header() })
    } catch (e) {
      new Notice(`Cannot get diff from commit ${commit_id}`)
    }
    return res
  }
  async create(path: string, commit: GitLabCommitOptions = {}, notifications: boolean = true, update_if_exist: boolean = true) {
    const file_content = await this.get_local_file(path)

    const data = {
      branch: commit.branch || this.options.branch,
      encoding: commit.encoding || 'base64',
      author_email: commit.author_email || this.options.email,
      author_name: commit.author_name || this.options.nick,
      commit_message: commit.commit_message || 'created file',
      content: file_content,
    }
    const file_url = `${this.options.api}/projects/${this.id()}/repository/files/${urlslash(path)}?ref=${data.branch}`
    let res = null
    try {
      res = await axios.post(
        file_url,
        data, {
        headers: this.header(),
      })
    } catch (e) {
      if (update_if_exist)
        if (notifications && this.options.notifications)
          new Notice('Cannot create file\nTrying update file')
      try {
        await this.modify(path, commit, notifications, false)
      } catch {
        if (this.options.notifications)
          new Notice('Cannot update file')
      }
    }
    return res
  }
  async modify(path: string, commit: GitLabCommitOptions = {}, notifications: boolean = true, create_if_not_exist: boolean = true) {
    const file_content = await this.get_local_file(path)

    const data = {
      branch: commit.branch || this.options.branch,
      encoding: commit.encoding || 'base64',
      author_email: commit.author_email || this.options.email,
      author_name: commit.author_name || this.options.nick,
      commit_message: commit.commit_message || 'modified file',
      content: file_content,
    }
    const file_url = `${this.options.api}/projects/${this.id()}/repository/files/${urlslash(path)}?ref=${data.branch}`
    let res = null

    try {
      res = await axios.put(
        file_url,
        data, {
        headers: this.header(),
      })
    } catch (e) {
      if (create_if_not_exist)
        if (notifications && this.options.notifications)
          new Notice('Cannot update file\nTrying create file')
      try {
        await this.create(path, commit, notifications, false)
      } catch {
        if (this.options.notifications)
          new Notice('Cannot create file')
      }

    }
    return res
  }
  async delete(path: string, commit: GitLabCommitOptions = {}, notifications: boolean = true) {
    const data = {
      branch: commit.branch || this.options.branch,
      author_email: commit.author_email || this.options.email,
      author_name: commit.author_name || this.options.nick,
      commit_message: commit.commit_message || 'deleted file',
    }
    const file_url = `${this.options.api}/projects/${this.id()}/repository/files/${urlslash(path)}?ref=${data.branch}`
    let res = null
    try {
      res = await axios({
        method: 'DELETE',
        url: file_url,
        data: data,
        headers: this.header()
      })
    } catch (e) {
      if (notifications && this.options.notifications)
        new Notice('Cannot delete file')
    }
    return res
  }
  async read(path: string, branch: string = this.options.branch) {
    const file_url = `${this.options.api}/projects/${this.id()}/repository/files/${urlslash(path)}?ref=${branch}`
    let res = null
    try {
      res = await axios.get(
        file_url, {
        headers: this.header(),
      })
    } catch (e) {
      if (this.options.notifications)
        new Notice('Cannot read file')
    }
    return res
  }
  async read_repo_tree(path: string = '', depth: number = 0, depth_limit: number = -1, notifications: boolean = true) {
    const url = exurl(`${this.options.api}/projects/${this.id()}/repository/tree`)
      .add('path', urlslash(path))
      .add('ref', this.options.branch)
      .add('recursive', 'true')

    const tree: string[][] = []
    const pages: any[] = []
    await this.pagination(1, url, (res) => {
      pages.push(...res.data)
    })
    for (const item of pages) {
      console.log(item)
      tree.push([item.id, item.path, item.type == 'tree'])

      if (this.options.notifications && notifications && item.type == 'tree')
        new Notice(`Fetching: "${item.path}"`)
      // if ((item.type == 'tree' && depth_limit == -1) || (item.type == 'tree' && depth < depth_limit && depth_limit != -1))
      //   tree.push(...(await this.read_repo_tree(item.path, depth + 1, depth_limit, notifications)))

    }
    return tree
  }
  snippet(title: string, description: string = '', visibility: string = 'private') {
    const snippet = new GitLabAPISnippet(this)
    snippet.metadata({ title, description, visibility })
    return snippet
  }
}

export class GitLabAPISnippet extends GitLabAPI {
  snippet_id: string
  title: string
  description: string
  visibility: string
  sync: boolean = false
  files: GitLabSnippetFile[] = []
  constructor(gitlab: GitLabAPI) {
    super()
    this.setoptions(gitlab.options)
  }
  body(): GitLabSnippetDoc {
    return {
      title: this.title,
      description: this.description,
      visibility: this.visibility,
      files: [],
    }
  }
  metadata(snippet: any) {
    this.title = snippet.title
    this.description = snippet.description
    this.visibility = snippet.visibility
  }
  async add_files(...files: GitLabSnippetFile[]) {
    for (const file of files) {
      file.action = file.action || "create"
      this.files.push(file)
    }
    if (this.sync) {
      if (this.snippet_id)
        await this.update_snippet({ files: files })
      else
        await this.create_snippet({ files: files })
    }
  }
  async update_files(...files: GitLabSnippetFile[]) {
    for (const file of files) {
      file.action = file.action || "update"
      if (!!file.previous_path)
        file.action = 'move'

      for (let index in this.files) {
        const item = this.files[index]
        if (file.file_path == item.file_path || file.previous_path == item.file_path)
          this.files[index] = file
      }
    }
    if (this.sync)
      await this.update_snippet({ files: files })
  }
  async remove_files(...files: GitLabSnippetFileOptional[]) {
    for (const file of files) {
      file.action = 'delete'
      if (!file.file_path) continue
      file.content = ''
      file.previous_path = ''
      for (let index = 0; index < this.files.length; index++) {
        const item = this.files[index]
        if (file.file_path == item.file_path || file.previous_path == item.file_path)
          this.files.splice(index, 1)
      }
    }
    if (this.sync)
      await this.update_snippet({ files: files as GitLabSnippetFile[] })
  }
  async from_id(id: string) {
    const snippet = await axios.get(
      `${this.options.api}/projects/${this.id()}/snippets/${id}`,
      { headers: this.header() })
    console.log(snippet)
    if (snippet && snippet.data) {
      this.snippet_id = id
      this.title = snippet.data.title
    }
    return snippet.data
  }
  async create_snippet(body: GitLabSnippetDocOptional = {}) {
    const create = await axios.post(
      `${this.options.api}/projects/${this.id()}/snippets`,
      { ...this.body(), ...body },
      { headers: this.header() })
    this.snippet_id = create.data.id
  }
  async update_snippet(body: GitLabSnippetDocOptional = {}) {
    if (!this.snippet_id) return
    await axios.put(
      `${this.options.api}/projects/${this.id()}/snippets/${this.snippet_id}`,
      { ...this.body(), ...body },
      { headers: this.header() })
  }
  async delete_snippet() {
    if (!this.snippet_id) return
    return await axios.delete(
      `${this.options.api}/projects/${this.id()}/snippets/${this.snippet_id}`,
      { headers: this.header() })
  }
  async get_file(path: string) {
    if (!this.snippet_id) return
    // TODO main - :ref -> default gitlab branch for all snippet
    const res = await axios.get(
      `${this.options.api}/projects/${this.id()}/snippets/${this.snippet_id}/files/main/${urlslash(path)}/raw`,
      { headers: this.header() })

    const content = res.data

    for (let file of this.files) {
      if (file.file_path == path || file.previous_path == path)
        file.content = content
    }

    return content
  }
  async get_snippet() {
    if (!this.snippet_id) return
    return await axios.get(
      `${this.options.api}/projects/${this.id()}/snippets/${this.snippet_id}/raw`,
      { headers: this.header() })
  }
}