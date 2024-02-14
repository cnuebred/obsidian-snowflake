import { App, Editor, Notice, Plugin, PluginSettingTab, Setting, SettingTab, SuggestModal, TFolder, WorkspaceLeaf} from 'obsidian'
import { GitLabAPI, GitLabOptions } from 'src/gitlab_api'
import { History, Logger, Pocket } from 'src/storage'
import { Queue } from 'src/async_queue'
import { LoggerLeaf, LOGGER_VIEW } from 'views/logger_view'
import { CHANGES_VIEW, ChangesLeaf } from 'views/changes_view'
import { OptionalGeneralModalConfig, SettingsViewpoint } from 'd'
import { DEFAULT_SETTINGS, GITLAB_API_URL, HISTORY_FILE, LOGGER_FILE, POCKET_TOKEN_KEY } from 'static'
import { SnowflakeSettings } from 'src/settings'

/**
 * Due obsidian.d.ts I had to created interface for specific property
 * sorry for only general declarations
 */

const urlslash = (...text: string[]): string => {
	const path = text.join('/')
	const end = path.slice(path.lastIndexOf('/'))
	const start = path.slice(0, path.lastIndexOf('/')).replace(/\./gm, '%2E')
	return (start + end).replace(/\//gm, '%2F')
}
function base64ToArrayBuffer(base64: string) {
	var binaryString = atob(base64)
	var bytes = new Uint8Array(binaryString.length)
	for (var i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}
	return bytes.buffer
}

export const pocket = new Pocket()
export const logger = new Logger(LOGGER_FILE)
export const history = new History(HISTORY_FILE)
const req_queue = new Queue()

export class SyncSnowflake extends Plugin {
	settings: SettingsViewpoint
	gitlab: GitLabAPI
	gitlab_settings = (): GitLabOptions => {
		return {
			api: GITLAB_API_URL,
			token: pocket.get(POCKET_TOKEN_KEY) || '',
			project: this.settings.project_name,
			repository: this.settings.repo_name,
			email: this.settings.email,
			nick: this.settings.username,
			branch: this.settings.branch,
			notifications: this.settings.notif
		}
	}
	command__send_all = async () => {
		const nc = new Notice('Sending...', 0)
		const status = [0, 0]
		const read_folder = async (dir: string) => {
			if (dir.contains('.git') || dir.contains('node_modules'))
				return
			const content = await app.vault.adapter.list(dir)
			for (const path of content.files) {
				nc.setMessage(path)
				status[0] += 1
				await this.gitlab.create(path, {}, false)
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
	command__send_changes = async () => {
		const changes = await history.lines(-history.lines_limit)
		changes.forEach((item: any) => {
			const parsed = history.parser(item)
			if (parsed.action == 'CREATE')
				req_queue.append(async () => {
					try {
						await this.gitlab.create(parsed.path,
							{ commit_message: `creating file "${parsed.path}" - ${parsed.time}` }
							, false)
						logger.log(`creating file "${parsed.path}"`)
					}
					catch {
						logger.log(`FAIL: creating file "${parsed.path}"`)
					}
				})
			if (parsed.action == 'MODIFY')
				req_queue.append(async () => {
					try {

						await this.gitlab.modify(parsed.path,
							{ commit_message: `modifying file "${parsed.path}" - ${parsed.time}` }, false)
						logger.log(`modifying file "${parsed.path}"`)

					} catch {
						logger.log(`FAIL: modifying file "${parsed.path}"`)
					}
				})
			if (parsed.action == 'DELETE')
				req_queue.append(async () => {
					try {
						await this.gitlab.delete(parsed.path,
							{ commit_message: `deleting file "${parsed.path}" - ${parsed.time}` }, false)
						logger.log(`deleting file "${parsed.path}"`)
					} catch {
						logger.log(`FAIL: deleting file "${parsed.path}"`)
					}
				})
			if (parsed.action == 'RENAME')
				req_queue.append(async () => {
					try {
						await this.gitlab.create(parsed.path,
							{ commit_message: `renaming[c] file "${parsed.old_path}" -> "${parsed.path}" - ${parsed.time}` }, false)
						await this.gitlab.delete(parsed.old_path,
							{ commit_message: `renaming[d] file "${parsed.old_path}" -> "${parsed.path}" - ${parsed.time}` }, false)
						logger.log(`renaming file "${parsed.old_path}" -> "${parsed.path}"`)
					} catch {
						logger.log(`FAIL: renaming file "${parsed.old_path}" -> "${parsed.path}"`)
					}
				})
		})
		history.clear()
		history.callback()
	}
	async activate_logger_view() {
		const { workspace } = this.app

		let leaf: WorkspaceLeaf | null = null
		const leaves = workspace.getLeavesOfType(LOGGER_VIEW)
		if (leaves.length > 0) {
			leaf = leaves[0]
		} else {
			leaf = workspace.getRightLeaf(false)
			await leaf.setViewState({ type: LOGGER_VIEW, active: false })
		}
		logger.set_callback(() => {
			if (leaf)
				(leaf.view as LoggerLeaf).update()
		})
	}
	async activate_changes_view() {
		const { workspace } = this.app

		let leaf: WorkspaceLeaf | null = null
		const leaves = workspace.getLeavesOfType(CHANGES_VIEW)
		if (leaves.length > 0) {
			leaf = leaves[0]
		} else {
			leaf = workspace.getRightLeaf(false)
			await leaf.setViewState({ type: CHANGES_VIEW, active: false })
		}
		history.set_callback(() => {
			if (leaf)
				(leaf.view as ChangesLeaf).update()
		})
	}
	async onload() {
		logger.set_config_dir(this.app.vault.configDir)
		history.set_config_dir(this.app.vault.configDir)

		await this.loadSettings()
		const status_bar = this.addStatusBarItem()

			this.registerView(
				LOGGER_VIEW,
				(leaf) => new LoggerLeaf(leaf)
			)
			this.registerView(
				CHANGES_VIEW,
				(leaf) => new ChangesLeaf(leaf)
			)

		//===========
		this.addCommand({
			id: 'gitlab_test_snowflake',
			name: 'test',
			callback: async () => {
				const last_pushed = pocket.get('last_pushed') || Date.now()
				const content = Object.entries(await this.app.vault.adapter.files)
				const filtered = content
					.filter((item: any) =>
						item[1].type == 'file' && (item[1].ctime > last_pushed || item[1].mtime > last_pushed)
					)
				for (const file of filtered) {
					console.log(file)
				}
				console.log('End')
			}
		})
		this.addCommand({
			id: 'gitlab_test_set_snowflake',
			name: 'test_set',
			callback: async () => {
				pocket.set('last_pushed', Date.now())
				logger.log('set last pushed')
				console.log(await logger.lines(-2, 2))
			}
		})
		this.addCommand({
			id: 'gitlab_test_view_snowflake',
			name: 'test_view',
			callback: async () => {
				const view = await this.app.workspace.getLeavesOfType(LOGGER_VIEW)
				console.log((view[0].view as LoggerLeaf).update())
			}
		})
		//===========
		this.addCommand({
			id: 'get_all_repository',
			name: 'Download all repository',
			callback: async () => {
				const include_config = await new CommandSelection({
					placeholder: 'Includes .obsidian?',
					options: ['YES', 'NO']
				}).open()

				const choose_pathtree = async (start_path: string = ''): Promise<string> => {
					const tree = await this.gitlab.read_repo_tree(start_path, 0, 0, false)
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
				const tree = await this.gitlab.read_repo_tree(path)
				tree.forEach(item => {
					if (item[2])
						app.vault.adapter.mkdir(item[1])
				})
				const file_status = new Notice('File: ', 0)
				for (const file of tree) {
					if (include_config == 'YES' && file[1].startsWith('.obsidian')) continue
					if (file[2]) continue
					const res = await this.gitlab.read(file[1])
					if (res == null) continue
					file_status.setMessage('File: ' + file[1])
					app.vault.adapter.writeBinary(file[1], base64ToArrayBuffer(res.data.content))
				}
				file_status.hide()

				new Notice('Done')
			}
		})
		this.addCommand({
			id: 'switch_branch_gitlab',
			name: 'Switch branch',
			callback: async () => {
				req_queue.append(async () => {
					const branches = await this.gitlab.get_branches()
					const branch = await new CommandSelection({
						placeholder: 'Type new or existing branch',
						initialValue: this.settings.branch,
						options: branches
					}).open()
					if (branches.includes(branch)) {
						this.settings.branch = branch
					} else {
						await this.gitlab.create_branch(branch, this.settings.branch)
					}
					await this.saveSettings()
				})
			}
		})
		this.addCommand({
			id: 'send_all_gitlab',
			name: 'Send all local files',
			callback: async () => {
				this.command__send_all()
			},
		})
		this.addCommand({
			id: 'send_changes_gitlab',
			name: 'Send local changes',
			callback: async () => {
				this.command__send_changes()
			}
			}
		)	
		this.addRibbonIcon('send', 'Send local changes', async (evt: MouseEvent) => {
			this.command__send_changes()
		}).addClass('my-plugin-ribbon-class')	
		this.addRibbonIcon('download-cloud', 'Fetch', async (evt: MouseEvent) => {
			const nc = new Notice('Fetching...', 0)
			const res = await this.gitlab.get_commits()
			const last_commit = res[res.length - 1]
			if (last_commit == pocket.get('last_commit_id'))
				return nc.setMessage('Everything is up to date')
			res.forEach((commit: any) => {
				req_queue.append(async () => {
					const res = await this.gitlab.get_diffs(commit.id)
					res?.data.forEach(async (item: any) => {
						req_queue.append(async () => {
							try {
								if (item.new_file || (!item.renamed_file && !item.new_file && !item.deleted_file))
									await this.gitlab.save_local_file(item.new_path)
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
			await this.gitlab.save_last_commit()
			nc.setMessage('Everything is up to date\nLast commit: ' + pocket.get('last_commit_id'))
		}).addClass('my-plugin-ribbon-class')


		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
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
											await this.gitlab.create(path)
										}
										for (const path of content.folders) {
											nc.setMessage(path)
											await read_folder(path)
										}
									}
									await read_folder(file.path)
								} else {
									await this.gitlab.create(file.path)
								}
								nc.setMessage('Done')
							})
							setTimeout(() => nc.hide(), 1000 * 5)
						})
				})
				menu.addItem((item) => {
					item
						.setTitle("Gitlab: Load File")
						.setIcon("file-down")
						.onClick(async () => {
							const nc = new Notice('Loading...', 0)
							req_queue.append(async () => {
								if ((file as TFolder).children) {
									const tree = await this.gitlab.read_repo_tree(file.path)
									tree.forEach(item => {
										if (item[2])
											app.vault.adapter.mkdir(item[1])
									})
									for (const file of tree) {
										if (file[2]) continue
										const res = await this.gitlab.read(file[1])
										if (res == null) continue
										app.vault.adapter.writeBinary(file[1], base64ToArrayBuffer(res.data.content))
									}
								} else {
									const res = await this.gitlab.read(file.path)
									if (res == null) return
									app.vault.adapter.writeBinary(file.path, base64ToArrayBuffer(res.data.content))
								}
								nc.setMessage('Done')
							})
							setTimeout(() => nc.hide(), 1000 * 7)

						})
				})
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
											await this.gitlab.delete(path)
										}
										for (const path of content.folders) {
											nc.setMessage(path)
											await read_folder(path)
										}
									}
									await read_folder(file.path)
								} else {
									await this.gitlab.delete(file.path)
								}
								nc.setMessage('Done')
							})
							setTimeout(() => nc.hide(), 1000 * 5)
						})
				})
				// menu.addItem((item) => {
				// 	const colab = this.settings.collaborator.find(item => item.path == file.path)
				// 	item.setTitle(`Gitlab: Start Colab`)
				// 		.setIcon("play")
				// 		.setDisabled(!!colab || file instanceof TFolder)
				// 		.onClick(async () => {
				// 			const nc = new Notice('Starting new colab...')
				// 			const snippet = await sync_data.create_colab(file.path)
				// 			const snippet_body = {
				// 				title: 'Test',
				// 				description: "okok",
				// 				visibility: 'private',
				// 			}
				// 			snippet.metadata(snippet_body)
				// 			snippet.file({
				// 				action: 'create',
				// 				file_path: 'file.xd',
				// 				content: 'Hello'
				// 			})
				// 			await snippet.create_snippet()
				// 			await snippet.from_id(snippet.snippet_id)
				// 		})
				// })
				// menu.addItem((item) => {
				// 	const colab = this.settings.collaborator.find(item => item.path == file.path)
				// 	item.setTitle(`Gitlab: Stop Colab`)
				// 		.setIcon("ban")
				// 		.onClick(async () => {
				// 			const nc = new Notice('Deleting...', 0)
				// 			req_queue.append(async () => {
				// 				if ((file as any).children) {
				// 					const read_folder = async (dir: string) => {
				// 						const content = await app.vault.adapter.list(dir)
				// 						for (const path of content.files) {
				// 							nc.setMessage(path)
				// 							await this.gitlab.delete(path)
				// 						}
				// 						for (const path of content.folders) {
				// 							nc.setMessage(path)
				// 							await read_folder(path)
				// 						}
				// 					}
				// 					await read_folder(file.path)
				// 				} else {
				// 					await this.gitlab.delete(file.path)
				// 				}
				// 				nc.setMessage('Done')
				// 			})
				// 			setTimeout(() => nc.hide(), 1000 * 7)
				// 		})
				// })
			})
		)

		this.registerEvent(
			this.app.workspace.on('file-open', async (file) => {
				if (!this.settings.auto) return
				if (!file?.path) return
				req_queue.append(async () => {
					status_bar.setText('Syncing...')
					await this.gitlab.save_local_file(file.path, file.path, true)
					status_bar.setText('Sync done')
				})
			})
		)
		setTimeout(() => {
			this.registerEvent(
				this.app.vault.on('create', async (file) => {
					history.add_action('CREATE', file.path)
					if (this.settings.auto)
						req_queue.append(async () => await this.gitlab.create(file.path))
				})
			)
			this.registerEvent(
				this.app.vault.on('modify', async (file) => {
					history.add_action('MODIFY', file.path)
					if (this.settings.auto)
						req_queue.append(async () => await this.gitlab.modify(file.path))
				})
			)
			this.registerEvent(
				this.app.vault.on('delete', async (file) => {
					history.add_action('DELETE', file.path)
					if (this.settings.auto)
						req_queue.append(async () => await this.gitlab.delete(file.path))
				})
			)
			this.registerEvent(
				this.app.vault.on('rename', async (file, old_path) => {
					history.add_action('RENAME', file.path, old_path)
					this.app.vault.adapter.files[file.name].rtime = Date.now()
					this.app.vault.adapter.files[file.name].old_path = old_path
					if (this.settings.auto)
						req_queue.append(async () => {
							await this.gitlab.create(file.path)
							await this.gitlab.delete(old_path)
						})
				})
			)
		}, 1000 * 3)
		setTimeout(() => {
			this.activate_logger_view()
			this.activate_changes_view()
		}, 1000)
		this.addSettingTab(new SnowflakeSettings(this.app, this))
	}
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
		const git_lab_options = this.gitlab_settings()
		this.gitlab = new GitLabAPI(git_lab_options)
	}
	async saveSettings() {
		await this.saveData(this.settings)
		const git_lab_options = this.gitlab_settings()
		this.gitlab.options = git_lab_options
	}
}

class CommandSelection extends SuggestModal<string>{
	resolve: (
		value: string | undefined | PromiseLike<string | undefined>
	) => void
	config: OptionalGeneralModalConfig

	constructor(config: OptionalGeneralModalConfig) {
		super(app)
		this.config = { ...config }
		this.setPlaceholder(this.config.placeholder || '')
	}

	open(): Promise<string> {
		super.open()

		if (this.config.initialValue != undefined) {
			this.inputEl.value = this.config.initialValue
			this.inputEl.dispatchEvent(new Event("input"))
		}

		return new Promise((resolve) => {
			this.resolve = resolve
		})
	}
	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		if (this.resolve) {
			let res
			if (this.config.allowEmpty && value === " ") res = ""
			else if (value === "...") res = undefined
			else res = value
			this.resolve(res)
		}
		super.selectSuggestion(value, evt)
	}
	onClose() {
		if (this.resolve) this.resolve(undefined)
	}
	getSuggestions(query: string): string[] {
		if (this.config.onlySelection) {
			return this.config.options || []
		} else if (this.config.allowEmpty) {
			return [query.length > 0 ? query : " ", ...this.config.options || []]
		} else {
			return [query.length > 0 ? query : "...", ...this.config.options || []]
		}
	}
	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value)
	}
	onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent) { }
}


//SHOW window for remote changes - commits -> changed files

		// this.registerEvent(
		// 	this.app.workspace.on('editor-menu', (menu, editor: Editor) => {
		// 		menu.addItem((item) => {
		// 			item
		// 				.setTitle("Get Block")
		// 				.setIcon("block")
		// 				.onClick(async () => {
		// 					console.log(editor)
		// 					console.log(editor.getScrollInfo())
		// 					console.log(editor.getValue())
		// 					console.log(editor.getLine(editor.listSelections()[0].head.line))
		// 					console.log(editor.getDoc())
		// 				})
		// 		})
		// 	})
		// )