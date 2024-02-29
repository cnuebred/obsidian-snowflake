import { local_logs, sync_logs } from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { FileMetaData,  } from "src/storage";
import { HISTORY_VIEW } from "static";


export class HistoryLeaf extends ItemView {
  sync_logs: HTMLElement
  local_logs: HTMLElement
  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
  }
  icon: string = 'scroll'
  getViewType(): string {
    return HISTORY_VIEW
  }
  getDisplayText(): string {
    return 'Snowflake History'
  }
  async reload_logs(element: HTMLElement, type: FileMetaData) {
    const logs = await type.lines(-300)
    element.empty()
    logs.reverse()
    logs.forEach(item => {
      element.createEl('span', {
        text: item
      })
    })
  }
  create_button(parent: Element, name: string, callback: () => void) {
    const button = parent.createEl('button', {
      text: name
    })
    button.style.margin = '10px'
    button.addEventListener('click', () => {
      callback()
    })

  }
  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h2", { text: "Snowflake History" });
    container.createEl("h3", { text: "Snowflake Local Changes" });
    this.create_button(container, 'Send changes', () => { })
    this.create_button(container, 'Clear changes', () => { })
    this.local_logs = container.createEl('div')
    container.createEl("h3", { text: "Snowflake Sync Logs" });
    this.create_button(container, 'Send changes', () => { })
    this.create_button(container, 'Clear changes', () => { })
    this.sync_logs = container.createEl('div');
    [this.local_logs, this.sync_logs].forEach(item => {
      item.style.fontSize = '11px'
      item.style.maxHeight = '500px'
      item.style.overflowY = 'auto'
      item.style.display = 'flex'
      item.style.flexDirection = 'column-reverse'
    })
  }
  async update(): Promise<void> {
    await this.reload_logs(this.local_logs, local_logs)
    await this.reload_logs(this.sync_logs, sync_logs)
  }
  async onOpen(): Promise<void> {
    await this.render()
    await this.reload_logs(this.local_logs, local_logs)
    await this.reload_logs(this.sync_logs, sync_logs)
  }
}