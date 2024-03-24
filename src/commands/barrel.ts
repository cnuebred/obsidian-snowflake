import {logs_panel} from "./show_panels"
import {fetch_changes, get_all_repository, send_all_gitlab, send_changes_gitlab} from "./repository_controller"

const commands = [
  logs_panel,
  get_all_repository,
  send_all_gitlab,
  send_changes_gitlab,
  fetch_changes
]
export default commands