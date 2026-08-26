
import { initSidebarToggle } from './global/sidebar.js';
import { initFooterClock, initDarkModeToggle } from './global/footer.js';
import { initModals } from './global/modal.js';

import { initDropdowns, initCombobox } from './ui/dropdown.js';
import { initAjaxForms } from './ui/forms.js';
import { initScatterGraph } from './ui/scatter_graph.js';

export function initApp() {
  initFooterClock();
  initDarkModeToggle();
  initSidebarToggle();
  initAjaxForms();
  initDropdowns();
  initCombobox();
  initModals();
  initScatterGraph();
}