import { local_changes_logs, sync_logs } from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { FileMetaData, } from "src/storage";
import { HISTORY_VIEW } from "src/static";


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
    const logs = await type.get_lines_by_index(-300)
    element.empty()
    logs.reverse().forEach(item => {
        element.createEl('code', {
          text: item.replace(/\t/gm, ' | '),
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

    this.local_logs = container.createEl('div')
    container.createEl("h3", { text: "Snowflake Sync Logs" });

    this.sync_logs = container.createEl('div');
    [this.local_logs, this.sync_logs].forEach(item => {
      item.style.fontSize = '10px'
      item.style.whiteSpace = 'nowrap'
      item.style.maxHeight = '500px'
      item.style.overflowY = 'auto'
      item.style.display = 'flex'
      item.style.flexDirection = 'column-reverse'
    })
  }
  async update(): Promise<void> {
    await this.reload_logs(this.local_logs, local_changes_logs)
    await this.reload_logs(this.sync_logs, sync_logs)
  }
  async onOpen(): Promise<void> {
    await this.render()
    await this.reload_logs(this.local_logs, local_changes_logs)
    await this.reload_logs(this.sync_logs, sync_logs)
  }
}