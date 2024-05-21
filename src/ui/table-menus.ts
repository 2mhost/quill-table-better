import Quill from 'quill';
import Delta from 'quill-delta';
import merge from 'lodash.merge';
import {
  createTooltip,
  getCellFormats,
  getCorrectBounds,
  getComputeBounds,
  getComputeSelectedCols,
  getComputeSelectedTds,
  setElementProperty,
  getElementStyle
} from '../utils';
import columnIcon from '../assets/icon/column.svg';
import rowIcon from '../assets/icon/row.svg';
import mergeIcon from '../assets/icon/merge.svg';
import tableIcon from '../assets/icon/table.svg';
import cellIcon from '../assets/icon/cell.svg';
import wrapIcon from '../assets/icon/wrap.svg';
import downIcon from '../assets/icon/down.svg';
import {
  TableCell,
  TableCellBlock,
  TableRow
} from '../formats/table';
import TablePropertiesForm from './table-properties-form';
import {
  cellDefaultValues,
  cellProperties,
  tableProperties
} from '../config';

interface Children {
  [propName: string]: {
    content: string
    handler: () => void
  }
}

interface MenusDefaults {
  [propName: string]: {
    content: string
    icon: string
    handler: (list: HTMLUListElement, tooltip: HTMLDivElement) => void
    children?: Children
  }
}

enum Alignment {
  left = 'margin-left',
  right = 'margin-right'
}

function getMenusConfig(useLanguage: _useLanguage): MenusDefaults {
  return {
    column: {
      content: useLanguage('col'),
      icon: columnIcon,
      handler(list, tooltip) {
        this.toggleAttribute(list, tooltip);
      },
      children: {
        left: {
          content: useLanguage('insColL'),
          handler() {
            const { leftTd } = this.getSelectedTdsInfo();
            this.insertColumn(leftTd, 0);
          }
        },
        right: {
          content: useLanguage('insColR'),
          handler() {
            const { rightTd } = this.getSelectedTdsInfo();
            this.insertColumn(rightTd, 1);
          }
        },
        delete: {
          content: useLanguage('delCol'),
          handler() {
            const { computeBounds, leftTd } = this.getSelectedTdsInfo();
            const deleteTds = getComputeSelectedTds(computeBounds, this.table, this.quill.container, 'column');
            const deleteCols = getComputeSelectedCols(computeBounds, this.table, this.quill.container);
            const tableBlot = Quill.find(leftTd).table();
            tableBlot.deleteColumn(deleteTds, this.hideMenus.bind(this), deleteCols);
          }
        }
      }
    },
    row: {
      content: useLanguage('row'),
      icon: rowIcon,
      handler(list, tooltip) {
        this.toggleAttribute(list, tooltip);
      },
      children: {
        above: {
          content: useLanguage('insRowAbv'),
          handler() {
            const { leftTd } = this.getSelectedTdsInfo();
            this.insertRow(leftTd, 0);
          }
        },
        below: {
          content: useLanguage('insRowBlw'),
          handler() {
            const { rightTd } = this.getSelectedTdsInfo();
            this.insertRow(rightTd, 1);
          }
        },
        delete: {
          content: useLanguage('delRow'),
          handler() {
            const selectedTds = this.tableBetter.cellSelection.selectedTds;
            const rows = [];
            let id = '';
            for (const td of selectedTds) {
              if (td.getAttribute('data-row') !== id) {
                rows.push(Quill.find(td.parentElement));
                id = td.getAttribute('data-row');
              }
            }
            const tableBlot = Quill.find(selectedTds[0]).table();
            tableBlot.deleteRow(rows, this.hideMenus.bind(this));
          }
        }
      }
    },
    merge: {
      content: useLanguage('mCells'),
      icon: mergeIcon,
      handler(list, tooltip) {
        this.toggleAttribute(list, tooltip);
      },
      children: {
        merge: {
          content: useLanguage('mCells'),
          handler() {
            this.mergeCells();
          }
        },
        split: {
          content: useLanguage('sCell'),
          handler() {
            this.splitCell();
          }
        }
      }
    },
    table: {
      content: useLanguage('tblProps'),
      icon: tableIcon,
      handler(list, tooltip) {
        const attribute = {
          ...getElementStyle(this.table, tableProperties),
          'align': this.getTableAlignment(this.table)
        };
        this.toggleAttribute(list, tooltip);
        this.tablePropertiesForm = new TablePropertiesForm(this, { attribute, type: 'table' });
        this.hideMenus();
      }
    },
    cell: {
      content: useLanguage('cellProps'),
      icon: cellIcon,
      handler(list, tooltip) {
        const { selectedTds } = this.tableBetter.cellSelection;
        const attribute =
          selectedTds.length > 1
            ? this.getSelectedTdsAttrs(selectedTds)
            : this.getSelectedTdAttrs(selectedTds[0]);
        this.toggleAttribute(list, tooltip);
        this.tablePropertiesForm = new TablePropertiesForm(this, { attribute, type: 'cell' });
        this.hideMenus();
      }
    },
    wrap: {
      content: useLanguage('insParaOTbl'),
      icon: wrapIcon,
      handler(list, tooltip) {
        this.toggleAttribute(list, tooltip);
      },
      children: {
        before: {
          content: useLanguage('insB4'),
          handler() {
            this.insertParagraph(-1);
          }
        },
        after: {
          content: useLanguage('insAft'),
          handler() {
            this.insertParagraph(1);
          }
        }
      }
    }
  };
}

class TableMenus {
  quill: any;
  table: HTMLTableElement | null;
  root: HTMLElement;
  prevList: HTMLUListElement | null;
  prevTooltip: HTMLDivElement | null;
  tableBetter: any;
  tablePropertiesForm: any;
  constructor(quill: any, tableBetter?: any) {
    this.quill = quill;
    this.table = null;
    this.prevList = null;
    this.prevTooltip = null;
    this.tableBetter = tableBetter;
    this.tablePropertiesForm = null;
    this.quill.root.addEventListener('click', this.handleClick.bind(this));
    this.root = this.createMenus();
  }

  createList(children: Children) {
    if (!children) return null;
    const container = document.createElement('ul');
    for (const [, child] of Object.entries(children)) {
      const { content, handler } = child;
      const list = document.createElement('li');
      list.innerText = content;
      list.addEventListener('click', handler.bind(this));
      container.appendChild(list);
    }
    container.classList.add('ql-table-dropdown-list', 'ql-hidden');
    return container;
  }

  createMenu(left: string, right: string, isDropDown: boolean) {
    const container = document.createElement('div');
    const dropDown = document.createElement('span');
    if (isDropDown) {
      dropDown.innerHTML = left + right;
    } else {
      dropDown.innerHTML = left;
    }
    container.classList.add('ql-table-dropdown');
    dropDown.classList.add('ql-table-tooltip-hover');
    container.appendChild(dropDown);
    return container;
  }

  createMenus() {
    const { language } = this.tableBetter;
    const useLanguage = language.useLanguage.bind(language);
    const container = document.createElement('div');
    container.classList.add('ql-table-menus-container', 'ql-hidden');
    for (const [, val] of Object.entries(getMenusConfig(useLanguage))) {
      const { content, icon, children, handler } = val;
      const list = this.createList(children);
      const tooltip = createTooltip(content);
      const menu = this.createMenu(icon, downIcon, !!children);
      menu.appendChild(tooltip);
      list && menu.appendChild(list);
      container.appendChild(menu);
      menu.addEventListener('click', handler.bind(this, list, tooltip));
    }
    this.quill.container.appendChild(container);
    return container;
  }

  destroyTablePropertiesForm() {
    if (!this.tablePropertiesForm) return;
    this.tablePropertiesForm.removePropertiesForm();
    this.tablePropertiesForm = null;
  }

  getRefInfo(row: TableRow, right: number) {
    let td = row.children.head;
    const id = td.domNode.getAttribute('data-row');
    while (td) {
      const { left } = td.domNode.getBoundingClientRect();
      if (Math.abs(left - right) <= 2) {
        return { id, ref: td };
      }
      td = td.next;
    }
    return { id, ref: null };
  }

  getSelectedTdAttrs(td: HTMLElement) {
    const align = Quill.find(td).children.head?.getAlign();
    const attr: Props =
      align
        ? { ...getElementStyle(td, cellProperties), 'text-align': align }
        : getElementStyle(td, cellProperties);
    return attr;
  }

  getSelectedTdsAttrs(selectedTds: HTMLElement[]) {
    const map = new Map();
    let attribute = null;
    for (const td of selectedTds) {
      const attr = this.getSelectedTdAttrs(td);
      if (!attribute) {
        attribute = attr;
        continue;
      }
      for (const key of Object.keys(attribute)) {
        if (map.has(key)) continue;
        if (attr[key] !== attribute[key]) {
          map.set(key, false);
        }
      }
    }
    for (const key of Object.keys(attribute)) {
      if (map.has(key)) {
        attribute[key] = cellDefaultValues[key];
      }
    }
    return attribute;
  }

  getSelectedTdsInfo() {
    const { startTd, endTd } = this.tableBetter.cellSelection;
    const startCorrectBounds = getCorrectBounds(startTd, this.quill.container);
    const endCorrectBounds = getCorrectBounds(endTd, this.quill.container);
    const computeBounds = getComputeBounds(startCorrectBounds, endCorrectBounds);
    if (
      startCorrectBounds.left > endCorrectBounds.left &&
      startCorrectBounds.top > endCorrectBounds.top
    ) {
      return {
        computeBounds,
        leftTd: endTd,
        rightTd: startTd
      };
    }
    return {
      computeBounds,
      leftTd: startTd,
      rightTd: endTd
    };
  }

  getTableAlignment(table: HTMLTableElement) {
    const align = table.getAttribute('align');
    if (!align) {
      const {
        [Alignment.left]: left,
        [Alignment.right]: right
      } = getElementStyle(table, [Alignment.left, Alignment.right]);
      if (left === 'auto') {
        if (right === 'auto') return 'center';
        return 'right';
      }
      return 'left';
    }
    return align || 'center';
  }

  handleClick(e: MouseEvent) {
    const table = (e.target as Element).closest('table');
    this.prevList && this.prevList.classList.add('ql-hidden');
    this.prevTooltip && this.prevTooltip.classList.remove('ql-table-tooltip-hidden');
    this.prevList = null;
    this.prevTooltip = null;
    if (!table && !this.tableBetter.cellSelection.selectedTds.length) {
      this.hideMenus();
      this.destroyTablePropertiesForm();
      return;
    } else {
      if (this.tablePropertiesForm) return;
      this.showMenus();
      if (table && !table.isEqualNode(this.table)) {
        this.updateMenus(table);
      }
      this.table = table;
    }
  }

  hideMenus() {
    this.root.classList.add('ql-hidden');
  }

  insertColumn(td: HTMLTableColElement, offset: number) {
    const { left, right, width } = td.getBoundingClientRect();
    const tdBlot = Quill.find(td);
    const tableBlot = tdBlot.table();
    const isLast = td.parentElement.lastChild.isEqualNode(td);
    if (offset > 0) {
      tableBlot.insertColumn(right, isLast, width);
    } else {
      tableBlot.insertColumn(left, isLast, width);
    }
    this.quill.update(Quill.sources.USER);
    this.quill.scrollSelectionIntoView();
  }

  insertParagraph(offset: number) {
    const blot = Quill.find(this.table);
    const index = this.quill.getIndex(blot);
    const length = offset > 0 ? blot.length() : 0;
    const delta = new Delta()
      .retain(index + length)
      .insert('\n');
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.setSelection(
      index + length,
      Quill.sources.SILENT,
    );
    this.quill.scrollSelectionIntoView();
    this.hideMenus();
    this.destroyTablePropertiesForm();
    this.tableBetter.cellSelection.clearSelected();
  }

  insertRow(td: HTMLTableColElement, offset: number) {
    const tdBlot = Quill.find(td);
    const index = tdBlot.rowOffset();
    const tableBlot = tdBlot.table();
    if (offset > 0) {
      const rowspan = ~~td.getAttribute('rowspan') || 1;
      tableBlot.insertRow(index + offset + rowspan - 1, offset);
    } else {
      tableBlot.insertRow(index + offset, offset);
    }
    this.quill.update(Quill.sources.USER);
    this.quill.scrollSelectionIntoView();
  }

  mergeCells() {
    const { selectedTds } = this.tableBetter.cellSelection;
    const { computeBounds, leftTd } = this.getSelectedTdsInfo();
    const leftTdBlot = Quill.find(leftTd);
    const [formats, cellId] = getCellFormats(leftTdBlot);
    const head = leftTdBlot.children.head;
    const tableBlot = leftTdBlot.table();
    const rows = tableBlot.tbody().children;
    const row = leftTdBlot.row();
    const colspan = row.children.reduce((colspan: number, td: TableCell) => {
      const tdCorrectBounds = getCorrectBounds(td.domNode, this.quill.container);
      if (
        tdCorrectBounds.left >= computeBounds.left &&
        tdCorrectBounds.right <= computeBounds.right
      ) {
        colspan += ~~td.domNode.getAttribute('colspan') || 1;
      }
      return colspan;
    }, 0);
    const rowspan = rows.reduce((rowspan: number, row: TableRow) => {
      const rowCorrectBounds = getCorrectBounds(row.domNode, this.quill.container);
      if (
        rowCorrectBounds.top >= computeBounds.top &&
        rowCorrectBounds.bottom <= computeBounds.bottom
      ) {
        let minRowspan = Number.MAX_VALUE;
        row.children.forEach((td: TableCell) => {
          const rowspan = ~~td.domNode.getAttribute('rowspan') || 1;
          minRowspan = Math.min(minRowspan, rowspan);
        });
        rowspan += minRowspan;
      }
      return rowspan;
    }, 0);
    for (const td of selectedTds) {
      if (leftTd.isEqualNode(td)) continue;
      const blot = Quill.find(td);
      blot.children.forEach((child: TableCellBlock) => {
        child.format && child.format(child.statics.blotName, cellId);
      });
      blot.moveChildren(leftTdBlot);
      blot.remove();
    }
    head.format(leftTdBlot.statics.blotName, { ...formats, colspan, rowspan });
    this.quill.update(Quill.sources.USER);
    this.tableBetter.cellSelection.setSelected(head.parent.domNode);
    this.quill.scrollSelectionIntoView();
  }

  showMenus() {
    this.root.classList.remove('ql-hidden');
  }

  splitCell() {
    const { selectedTds } = this.tableBetter.cellSelection;
    const { leftTd } = this.getSelectedTdsInfo();
    const leftTdBlot = Quill.find(leftTd);
    const head = leftTdBlot.children.head;
    for (const td of selectedTds) {
      const colspan = ~~td.getAttribute('colspan') || 1;
      const rowspan = ~~td.getAttribute('rowspan') || 1;
      const { width, right } = td.getBoundingClientRect();
      const blot = Quill.find(td);
      const tableBlot = blot.table();
      const nextBlot = blot.next;
      const rowBlot = blot.row();
      if (rowspan > 1) {
        if (colspan > 1) {
          let nextRowBlot = rowBlot.next;
          for (let i = 1; i < rowspan; i++) {
            const { ref, id } = this.getRefInfo(nextRowBlot, right);
            for (let j = 0; j < colspan; j++) {
              tableBlot.insertColumnCell(nextRowBlot, id, ref);
            }
            nextRowBlot = nextRowBlot.next;
          }
        } else {
          let nextRowBlot = rowBlot.next;
          for (let i = 1; i < rowspan; i++) {
            const { ref, id } = this.getRefInfo(nextRowBlot, right);
            tableBlot.insertColumnCell(nextRowBlot, id, ref);
            nextRowBlot = nextRowBlot.next;
          }
        }
      }
      if (colspan > 1) {
        const id = td.getAttribute('data-row');
        for (let i = 1; i < colspan; i++) {
          tableBlot.insertColumnCell(rowBlot, id, nextBlot);
        }
      }
      const [formats] = getCellFormats(blot);
      blot.children.head.format(blot.statics.blotName, {
        ...formats,
        width: ~~(width / colspan),
        colspan: null,
        rowspan: null
      });
    }
    this.quill.update(Quill.sources.USER);
    this.tableBetter.cellSelection.setSelected(head.parent.domNode);
    this.quill.scrollSelectionIntoView();
  }

  toggleAttribute(list: HTMLUListElement, tooltip: HTMLDivElement) {
    if (this.prevList && !this.prevList.isEqualNode(list)) {
      this.prevList.classList.add('ql-hidden');
      this.prevTooltip.classList.remove('ql-table-tooltip-hidden');
    }
    if (!list) return;
    list.classList.toggle('ql-hidden');
    tooltip.classList.toggle('ql-table-tooltip-hidden');
    this.prevList = list;
    this.prevTooltip = tooltip;
  }

  updateMenus(table: Element = this.table) {
    const { left, right, top } = getCorrectBounds(table, this.quill.container);
    const { height, width } = this.root.getBoundingClientRect();
    setElementProperty(this.root, {
      left: `${(left + right - width) >> 1}px`,
      top: `${top - height - 10}px`
    });
  }
}

export default TableMenus;