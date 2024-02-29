import { gitlab, req_queue } from "main"
import { Menu, Notice, TAbstractFile, TFolder } from "obsidian"
import { base64ToArrayBuffer } from "src/utils"

export const file_menu_send_file = (menu: Menu, file: TAbstractFile) => {
  menu.addItem((item) => {
    item
      .setTitle("Gitlab: Send File")
      .setIcon("send")
      .onClick(async () => {
        const nc = new Notice('Sending...', 0)
        req_queue.append(async () => {
          if ((file as TFolder).children) {
            const read_folder = async (dir: string) => {
              const content = await app.vault.adapter.list(dir)
              for (const path of content.files) {
                nc.setMessage(path)
                await gitlab.create(path)
              }
              for (const path of content.folders) {
                nc.setMessage(path)
                await read_folder(path)
              }
            }
            await read_folder(file.path)
          } else {
            await gitlab.create(file.path)
          }
          nc.setMessage('Done')
        })
        setTimeout(() => nc.hide(), 1000 * 5)
      })
  })
}

export const file_menu_load_file = (menu: Menu, file: TAbstractFile) => {
  menu.addItem((item) => {
    item
      .setTitle("Gitlab: Load File")
      .setIcon("file-down")
      .onClick(async () => {
        const nc = new Notice('Loading...', 0)
        req_queue.append(async () => {
          if ((file as TFolder).children) {
            const tree = await gitlab.read_repo_tree(file.path)
            tree.forEach(item => {
              if (item[2])
                app.vault.adapter.mkdir(item[1])
            })
            for (const file of tree) {
              if (file[2]) continue
              const res = await gitlab.read(file[1])
              if (res == null) continue
              app.vault.adapter.writeBinary(file[1], base64ToArrayBuffer(res.data.content))
            }
          } else {
            const res = await gitlab.read(file.path)
            if (res == null) return
            app.vault.adapter.writeBinary(file.path, base64ToArrayBuffer(res.data.content))
          }
          nc.setMessage('Done')
        })
        setTimeout(() => nc.hide(), 1000 * 7)

      })
  })
}

export const file_menu_delete_file = (menu: Menu, file: TAbstractFile) => {
  menu.addItem((item) => {
    item
      .setTitle("Gitlab: Delete File")
      .setIcon("trash-2")
      .onClick(async () => {
        const nc = new Notice('Deleting...', 0)
        req_queue.append(async () => {
          if ((file as any).children) {
            const read_folder = async (dir: string) => {
              const content = await app.vault.adapter.list(dir)
              for (const path of content.files) {
                nc.setMessage(path)
                await gitlab.delete(path)
              }
              for (const path of content.folders) {
                nc.setMessage(path)
                await read_folder(path)
              }
            }
            await read_folder(file.path)
          } else {
            await gitlab.delete(file.path)
          }
          nc.setMessage('Done')
        })
        setTimeout(() => nc.hide(), 1000 * 5)
      })
  })
}