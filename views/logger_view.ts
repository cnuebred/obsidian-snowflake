import { logger } from "main";
import { ItemView, WorkspaceLeaf } from "obsidian";

export const LOGGER_VIEW = "logger-view";

export class LoggerLeaf extends ItemView {
  div_container: HTMLElement
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }
  icon:string = 'scroll'
  getViewType() {
    return LOGGER_VIEW;
  }

  getDisplayText() {
    return "Snowflake Sync logs";
  }

  async reload_logs(){
    const logs = await logger.lines(-300)
    this.div_container.empty()
    logs.reverse()
    logs.forEach(item => {
      this.div_container.createEl('span', {
        text: item
      })
    })
  }

  async render(){
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h3", { text: "Snowflake Sync Logs" });
    const div = container.createEl('div')
    this.div_container = div
    div.style.fontSize = '10px'
    div.style.maxHeight = '500px'
    div.style.overflowY = 'auto'
    div.style.display = 'flex'
    div.style.flexDirection = 'column-reverse'    
  }
  async update(): Promise<void> {
    await this.reload_logs()
  }
  async onOpen(): Promise<void>{
    await this.render()
    await this.reload_logs()
  }
}