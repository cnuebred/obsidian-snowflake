import { gitlab, local_logs, req_queue, sync_logs } from 'main'
import { CommandSelection } from '../modal/selection'
import { Notice } from 'obsidian'
import { base64ToArrayBuffer } from 'src/utils'


const command__send_all = async () => {
  const nc = new Notice('Sending...', 0)
  const status = [0, 0]
  const read_folder = async (dir: string) => {
    if (dir.contains('.git') || dir.contains('node_modules'))
      return
    const content = await app.vault.adapter.list(dir)
    for (const path of content.files) {
      nc.setMessage(path)
      status[0] += 1
      await gitlab.create(path, {}, false)
    }
    for (const path of content.folders) {
      nc.setMessage(path)
      status[1] += 1
      await read_folder(path)
    }
  }
  await read_folder('/')
  nc.setMessage(`Done for ${status[0]} files in ${status[1]} folders`)
  setTimeout(() => nc.hide(), 1000 * 5)
}

const command__send_changes = async () => {
  const changes = await local_logs.lines(-local_logs.lines_limit)
  changes.forEach((item: any) => {
    const parsed = local_logs.parser(item)
    if (parsed.action == 'CREATE')
      req_queue.append(async () => {
        try {
          await gitlab.create(parsed.path,
            { commit_message: `creating file "${parsed.path}" - ${parsed.time}` }
            , false)
          sync_logs.log(`creating file "${parsed.path}"`)
        }
        catch {
          sync_logs.log(`FAIL: creating file "${parsed.path}"`)
        }
      })
    if (parsed.action == 'MODIFY')
      req_queue.append(async () => {
        try {

          await gitlab.modify(parsed.path,
            { commit_message: `modifying file "${parsed.path}" - ${parsed.time}` }, false)
          sync_logs.log(`modifying file "${parsed.path}"`)

        } catch {
          sync_logs.log(`FAIL: modifying file "${parsed.path}"`)
        }
      })
    if (parsed.action == 'DELETE')
      req_queue.append(async () => {
        try {
          await gitlab.delete(parsed.path,
            { commit_message: `deleting file "${parsed.path}" - ${parsed.time}` }, false)
          sync_logs.log(`deleting file "${parsed.path}"`)
        } catch {
          sync_logs.log(`FAIL: deleting file "${parsed.path}"`)
        }
      })
    if (parsed.action == 'RENAME')
      req_queue.append(async () => {
        try {
          await gitlab.create(parsed.path,
            { commit_message: `renaming[c] file "${parsed.old_path}" -> "${parsed.path}" - ${parsed.time}` }, false)
          await gitlab.delete(parsed.old_path,
            { commit_message: `renaming[d] file "${parsed.old_path}" -> "${parsed.path}" - ${parsed.time}` }, false)
          sync_logs.log(`renaming file "${parsed.old_path}" -> "${parsed.path}"`)
        } catch {
          sync_logs.log(`FAIL: renaming file "${parsed.old_path}" -> "${parsed.path}"`)
        }
      })
  })
  local_logs.clear()
  local_logs.callback()
}

export const get_all_repository = {
  id: 'get_all_repository',
  name: 'Download all repository',
  callback: async () => {
    const include_config = await new CommandSelection({
      placeholder: 'Includes .obsidian?',
      options: ['YES', 'NO']
    }).open()

    const choose_pathtree = async (start_path: string = ''): Promise<string> => {
      const tree = await gitlab.read_repo_tree(start_path, 0, 0, false)
      const folders = tree.filter(item => item[2]).map(item => item[1])
      if (folders.length == 0)
        return start_path
      const repo_path = await new CommandSelection({
        placeholder: 'Repo dir path - leave empty for whole repo or .. to back',
        options: folders
      }).open()

      if (!repo_path)
        return start_path
      if (repo_path == '..')
        return choose_pathtree('')
      return choose_pathtree(repo_path)
    }

    const path = await choose_pathtree('')
    const tree = await gitlab.read_repo_tree(path)
    tree.forEach(item => {
      if (item[2])
        app.vault.adapter.mkdir(item[1])
    })
    const file_status = new Notice('File: ', 0)
    for (const file of tree) {
      if (include_config == 'YES' && file[1].startsWith('.obsidian')) continue
      if (file[2]) continue
      const res = await gitlab.read(file[1])
      if (res == null) continue
      file_status.setMessage('File: ' + file[1])
      app.vault.adapter.writeBinary(file[1], base64ToArrayBuffer(res.data.content))
    }
    file_status.hide()

    new Notice('Done')
  }
}

export const send_all_gitlab =  {
  id: 'send_all_gitlab',
  name: 'Send all local files',
  callback: async () => {
    command__send_all()
  },
}

export const send_changes_gitlab = {
  id: 'send_changes_gitlab',
  name: 'Send local changes',
  callback: async () => {
    command__send_changes()
  }
}

