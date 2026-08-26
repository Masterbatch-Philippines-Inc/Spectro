
import { initSidebarToggle } from './global/sidebar.js';
import { initFooterClock, initDarkModeToggle } from './global/footer.js';
import { initModals } from './global/modal.js';
import { initDropdowns, initCombobox } from './ui/dropdown.js';
import { initAjaxForms } from './ui/forms.js';
import { initScatterGraph } from './ui/scatter_graph.js';
import { initSamplesRecordPage } from './pages/samples_record.js';
import { initSamplesReaderPage } from './pages/samples_reader.js';

export function initApp() {
  initFooterClock();
  initDarkModeToggle();
  initSidebarToggle();
  initAjaxForms();
  initDropdowns();
  initCombobox();
  initModals();
  initScatterGraph();
 
  if (document.getElementById('dataTable') && window.SAMPLES_RECORD_URLS) {
    initSamplesRecordPage(window.SAMPLES_RECORD_URLS);
  }
 
  if (document.getElementById('connectBtn') && window.SAMPLES_READER_URLS) {
    const productCodeOptionsEl = document.getElementById('productCodeOptions');
    let productCodeOptions = [];
    try {
      productCodeOptions = productCodeOptionsEl ? JSON.parse(productCodeOptionsEl.textContent) : [];
    } catch (e) { productCodeOptions = []; }
    initSamplesReaderPage(window.SAMPLES_READER_URLS, productCodeOptions);
  }
}