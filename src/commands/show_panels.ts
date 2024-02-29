import { activate_history_view } from "views/views"

export const logs_panel = {
  id: 'open_logs_panel',
  name: 'Open Snowflake Logs',
  callback: async () => {
    activate_history_view()
  }
}