import Quill from 'quill';
import merge from 'lodash.merge';
import {
  setElementProperty,
  getCorrectBounds,
  getComputeBounds,
  getComputeSelectedTds
} from '../utils';
import columnIcon from '../assets/icon/column.svg';
import downIcon from '../assets/icon/down.svg';
import { TableCell, TableRow } from '../formats/table';

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
    handler: () => void
    children?: Children
  }
}

const MENUS_DEFAULTS: MenusDefaults = {
  column: {
    content: 'Column',
    icon: columnIcon,
    handler: () => {},
    children: {
      left: {
        content: 'Insert column left',
        handler() {
          const { leftTd } = this.getSelectedTdsInfo();
          this.insertColumn(leftTd, 0);
        }
      },
      right: {
        content: 'Insert column right',
        handler() {
          const { rightTd } = this.getSelectedTdsInfo();
          this.insertColumn(rightTd, 1);
        }
      },
      delete: {
        content: 'Delete column',
        handler() {
          const { computeBounds, leftTd } = this.getSelectedTdsInfo();
          const deleteTds = getComputeSelectedTds(computeBounds, this.table, this.quill.container, 'column');
          const tableBlot = Quill.find(leftTd).table();
          tableBlot.deleteColumn(deleteTds, this.hideMenus.bind(this));
        }
      }
    }
  },
  row: {
    content: 'Row',
    icon: columnIcon,
    handler: () => {},
    children: {
      above: {
        content: 'Insert row above',
        handler() {
          const { leftTd } = this.getSelectedTdsInfo();
          this.insertRow(leftTd, 0);
        }
      },
      below: {
        content: 'Insert row below',
        handler() {
          const { rightTd } = this.getSelectedTdsInfo();
          this.insertRow(rightTd, 1);
        }
      },
      delete: {
        content: 'Delete row',
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
    content: 'Merge cells',
    icon: columnIcon,
    handler: () => {},
    children: {
      merge: {
        content: 'Merge cells',
        handler() {
          const { selectedTds } = this.tableBetter.cellSelection;
          const { computeBounds, leftTd } = this.getSelectedTdsInfo();
          const leftTdBlot = Quill.find(leftTd);
          const tableBlot = leftTdBlot.table();
          const rows = tableBlot.children.head.children;
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
          const rowspan = rows.reduce((rowspan: number, row: TableCell) => {
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
            blot.moveChildren(leftTdBlot);
            blot.remove();
          }
          leftTdBlot.domNode.setAttribute('colspan', colspan);
          leftTdBlot.domNode.setAttribute('rowspan', rowspan);
          this.tableBetter.cellSelection.selectedTds = [leftTdBlot.domNode];
        }
      },
      split: {
        content: 'Split cell',
        handler() {
          const { selectedTds } = this.tableBetter.cellSelection;
          for (const td of selectedTds) {
            const colspan = ~~td.getAttribute('colspan') || 1;
            const rowspan = ~~td.getAttribute('rowspan') || 1;
            const { width, height, right } = td.getBoundingClientRect();
            const blot = Quill.find(td);
            const tableBlot = blot.table();
            const nextBlot = blot.next;
            const rowBlot = blot.row();
            if (rowspan > 1) {
              if (colspan > 1) {
                let nextRowBlot = rowBlot.next;
                for (let i = 1; i < rowspan; i++) {
                  const ref = this.getRef(nextRowBlot, right);
                  for (let j = 0; j < colspan; j++) {
                    const id = ref.domNode.getAttribute('data-row');
                    tableBlot.insertColumnCell(nextRowBlot, id, ref);
                  }
                  nextRowBlot = nextRowBlot.next;
                }
              } else {
                let nextRowBlot = rowBlot.next;
                for (let i = 1; i < rowspan; i++) {
                  const ref = this.getRef(nextRowBlot, right);
                  const id = ref.domNode.getAttribute('data-row');
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
            td.setAttribute('width', ~~(width / colspan));
            td.removeAttribute('colspan');
            td.removeAttribute('rowspan');
          }
        }
      }
    }
  }
}

class TableMenus {
  quill: any;
  table: Element | null;
  root: HTMLElement;
  prevList: HTMLUListElement | null;
  tableBetter: any;
  constructor(quill: any, tableBetter?: any) {
    this.quill = quill;
    this.table = null;
    this.root = this.createMenus();
    this.prevList = null;
    this.tableBetter = tableBetter;
    this.quill.root.addEventListener('click', this.handleClick.bind(this));
  }

  handleClick(e: MouseEvent) {
    const table = (e.target as Element).closest('table');
    this.prevList && this.prevList.classList.add('ql-hidden');
    this.prevList = null;
    if (!table && !this.tableBetter.cellSelection.selectedTds.length) {
      this.hideMenus();
      return;
    } else {
      // const cell = (e.target as Element).closest('td');
      // const { left, right, top } = getCorrectBounds(cell, this.quill.container);
      // this.root.classList.remove('ql-hidden');
      // const { height } = this.root.getBoundingClientRect();
      // setElementProperty(this.root, {
      //   left: `${left}px`,
      //   top: `${top - height - 10}px`
      // });
      this.showMenus();
      if (!table.isEqualNode(this.table)) {
        const { left, right, top } = getCorrectBounds(table, this.quill.container);
        const { height, width } = this.root.getBoundingClientRect();
        setElementProperty(this.root, {
          left: `${(left + right - width) >> 1}px`,
          top: `${top - height - 10}px`
        });
      }
      this.table = table;
    }
  }

  createMenus() {
    const container = document.createElement('div');
    container.classList.add('ql-table-menus-container', 'ql-hidden');
    for (const [, val] of Object.entries(MENUS_DEFAULTS)) {
      const { content, icon, children } = val;
      const list = this.createList(children);
      const tooltip = this.createTooltip(content);
      const menu = this.createMenu(icon, downIcon, !!children);
      menu.appendChild(tooltip);
      menu.appendChild(list);
      container.appendChild(menu);
      menu.addEventListener('click', this.toggleAttribute.bind(this, list));
    }
    this.quill.container.appendChild(container);
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
    dropDown.classList.add('ql-table-dropdown-icon');
    container.appendChild(dropDown);
    return container;
  }

  createList(children: Children) {
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

  createTooltip(content: string) {
    const element = document.createElement('div');
    element.innerText = content;
    element.classList.add('ql-table-tooltip', 'ql-hidden');
    return element;
  }

  toggleAttribute(list: HTMLUListElement) {
    if (this.prevList && !this.prevList.isEqualNode(list)) {
      this.prevList.classList.add('ql-hidden');
    }
    list.classList.toggle('ql-hidden');
    this.prevList = list;
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
  }

  insertColumn(td: HTMLTableColElement, offset: number) {
    const { left, right } = td.getBoundingClientRect();
    const tdBlot = Quill.find(td);
    const tableBlot = tdBlot.table();
    if (offset > 0) {
      const isLast = td.parentElement.lastChild.isEqualNode(td);
      if (isLast) {
        tableBlot.insertColumn(right, isLast);
      } else {
        tableBlot.insertColumn(right);
      }
    } else {
      tableBlot.insertColumn(left);
    }
    this.quill.update(Quill.sources.USER);
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

  getRef(row: TableRow, right: number): TableCell {
    let ref = null;
    row.children.forEach((td: TableCell) => {
      const { left } = td.domNode.getBoundingClientRect();
      if (Math.abs(left - right) <= 2) {
        ref = td;
        return;
      }
    });
    return ref;
  }

  hideMenus() {
    this.root.classList.add('ql-hidden');
  }

  showMenus() {
    this.root.classList.remove('ql-hidden');
  }
}

export default TableMenus;