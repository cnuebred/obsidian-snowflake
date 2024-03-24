import { gitlab, local_changes_logs, pocket, req_queue, sync_logs } from 'main'
import { CommandSelection } from '../modal/selection'
import { Notice } from 'obsidian'
import { base64ToArrayBuffer } from 'src/utils'




export const command__send_all = async () => {
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
  await gitlab.save_last_commit()
  nc.setMessage(`Done for ${status[0]} files in ${status[1]} folders`)
  setTimeout(() => nc.hide(), 1000 * 5)
}

export const command__send_changes = async () => {
  const logged_local_changes_from_file = await local_changes_logs.get_lines_from_to_phrase('LOCAL CHANGES')
  const files_states: Map<string, { time: string, action: string, path: string, old_path?: string }> = new Map()
  let logged_local_changes_parsed: [string, { time: string, action: string, path: string, old_path?: string }][] = []
  logged_local_changes_from_file.reverse().forEach(item => {
    const parsed_object = local_changes_logs.parser(item)
    if (!!parsed_object.old_path)
      files_states.delete(parsed_object.old_path)

    if (files_states.has(parsed_object.path) && parsed_object.action == 'DELETE')
      files_states.delete(parsed_object.path)

    if (files_states.has(parsed_object.path) && parsed_object.action == 'MODIFY') {
      files_states.set(parsed_object.path, { ...parsed_object, action: 'CREATE' })
      return
    }

    files_states.set(parsed_object.path, parsed_object)
    logged_local_changes_parsed = Array.from(files_states.entries())
  }
  )

  logged_local_changes_parsed.forEach((item: any) => {
    const parsed = item[1]
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
  await gitlab.save_last_commit()
  local_changes_logs.add_action('LOCAL CHANGES PUSHED', `${logged_local_changes_parsed.length} changes`)
  local_changes_logs.callback()
}

export const command__get_all_repo = async () => {
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
  await gitlab.save_last_commit()

  file_status.hide()
  new Notice('Done')
}

export const command__fetch_changes = async () => {
  const nc = new Notice('Fetching...', 0)
  const res = await gitlab.get_commits()
  const last_commit = res[res.length - 1]
  if (!last_commit)
    return await gitlab.save_last_commit()

  if (last_commit.id == pocket.get('last_commit_id'))
    return nc.setMessage('Everything is up to date')
  let content_remote_changes = 0
  res.forEach((commit: any) => {
    req_queue.append(async () => {
      const res = await gitlab.get_diffs(commit.id)
      res?.data.forEach(async (item: any) => {
        content_remote_changes++
        req_queue.append(async () => {
          try {
            if (item.new_file || (!item.renamed_file && !item.new_file && !item.deleted_file))
              await gitlab.save_local_file(item.new_path)
            if (item.renamed_file)
              await app.vault.adapter.rename(item.old_path, item.new_path)
            if (item.deleted_file)
              await app.vault.adapter.remove(item.new_path)
          } catch {
            console.log('fetching errors')
          }
        })
      })
    })
  })
  await gitlab.save_last_commit()
  req_queue.append(() => local_changes_logs.add_action('LOCAL CHANGES PULLED', `${content_remote_changes} changes`))

  nc.setMessage('Everything is up to date\nLast commit: ' + pocket.get('last_commit_id'))
}


export const get_all_repository = {
  id: 'get_all_repository',
  name: 'Download all repository',
  callback: async () => {
    command__get_all_repo()
  }
}
export const fetch_changes = {
  id: 'fetch_changes',
  name: 'Fetch remote changes',
  callback: async () => {
    command__fetch_changes()
  }
}

export const send_all_gitlab = {
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

