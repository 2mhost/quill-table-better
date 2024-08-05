import Quill from 'quill';
import Delta from 'quill-delta';
import {
  cellId,
  TableCellBlock,
  TableCell,
  TableRow,
  TableBody,
  TableTemporary,
  TableContainer,
  tableId,
  TableCol,
  TableColgroup
} from './formats/table';
import { 
  matchTable,
  matchTableCell,
  matchTableCol,
  matchTableTemporary
} from './utils/clipboard-matchers';
import Language from './language';
import CellSelection from './ui/cell-selection';
import OperateLine from './ui/operate-line';
import TableMenus from './ui/table-menus';
import { CELL_DEFAULT_WIDTH } from './config';
import ToolbarTable from './ui/toolbar-table';
import { getCorrectCellBlot } from './utils';

interface Context {
  [propName: string]: any
}

interface Options {
  language?: string | {
    name: string
    content: Props
  }
  menus?: string[]
  toolbarTable?: boolean
}

const Container = Quill.import('blots/container');
const Module = Quill.import('core/module');

class Table extends Module {
  static register() {
    Quill.register(TableCellBlock, true);
    Quill.register(TableCell, true);
    Quill.register(TableRow, true);
    Quill.register(TableBody, true);
    Quill.register(TableTemporary, true);
    Quill.register(TableContainer, true);
    Quill.register(TableCol, true);
    Quill.register(TableColgroup, true);
  }

  constructor(quill: any, options: Options) {
    super(quill, options);
    quill.clipboard.addMatcher('td, th', matchTableCell);
    quill.clipboard.addMatcher('tr', matchTable);
    quill.clipboard.addMatcher('col', matchTableCol);
    quill.clipboard.addMatcher('table', matchTableTemporary);
    this.language = new Language(options?.language);
    this.cellSelection = new CellSelection(quill);
    this.operateLine = new OperateLine(quill, this);
    this.tableMenus = new TableMenus(quill, this);
    document.addEventListener('keyup', this.handleKeyup.bind(this));
    quill.root.addEventListener('mousedown', this.handleMousedown.bind(this));
    quill.root.addEventListener('scroll', this.handleScroll.bind(this));
    this.registerToolbarTable(options?.toolbarTable);
  }

  private containers(
    blot: TableCell,
    index = 0,
    length = Number.MAX_VALUE
  ) {
    const getContainers = (
      blot: TableCell,
      blotIndex: number,
      blotLength: number
    ) => {
      // @ts-ignore
      let containers: Container[] = [];
      let lengthLeft = blotLength;
      blot.children.forEachAt(
        blotIndex,
        blotLength,
        // @ts-ignore
        (child, childIndex, childLength) => {
          if (child instanceof Container) {
            containers.push(child);
            containers = containers.concat(getContainers(child, childIndex, lengthLeft));
          } 
          lengthLeft -= childLength;
        }
      );
      return containers;
    };
    return getContainers(blot, index, length);
  }

  deleteTable() {
    const [table] = this.getTable();
    if (table == null) return;
    const offset = table.offset();
    table.remove();
    this.hideTools();
    this.quill.update(Quill.sources.USER);
    this.quill.setSelection(offset, Quill.sources.SILENT);
  }

  deleteTableTemporary() {
    const temporaries = this.quill.scroll.descendants(TableTemporary);
    for (const temporary of temporaries) {
      temporary.remove();
    }
    this.hideTools();
  }

  private getLength(blots: any[]): number {
    return blots.reduce((sum, blot) => {
      return sum += blot.length();
    }, 0);
  }

  getTable(range = this.quill.getSelection()) {
    if (range == null) return [null, null, null, -1];
    const [block, offset] = this.quill.getLine(range.index);
    if (block == null || block.statics.blotName !== TableCellBlock.blotName) {
      return [null, null, null, -1];
    }
    const cell = block.parent;
    const row = cell.parent;
    const table = row.parent.parent;
    return [table, row, cell, offset];
  }

  handleKeyup(e: KeyboardEvent) {
    this.cellSelection.handleKeyup(e);
    if (e.ctrlKey && (e.key === 'z' || e.key === 'y')) {
      this.hideTools();
    }
  }

  handleMousedown(e: MouseEvent) {
    ToolbarTable.hide(ToolbarTable.root);
    const table = (e.target as Element).closest('table');
    if (!table) return this.hideTools();
    this.cellSelection.handleMousedown(e);
    this.cellSelection.setDisabled(true);
  }

  handleScroll() {
    this.hideTools();
    this.tableMenus?.updateScroll(true);
  }

  hideTools() {
    this.cellSelection?.clearSelected();
    this.cellSelection?.setDisabled(false);
    this.operateLine?.hideDragBlock();
    this.operateLine?.hideDragTable();
    this.operateLine?.hideLine();
    this.tableMenus?.hideMenus();
    this.tableMenus?.destroyTablePropertiesForm();
  }

  insertTable(rows: number, columns: number) {
    const range = this.quill.getSelection();
    if (range == null) return;
    if (this.isTable(range)) return;
    const formats = this.quill.getFormat(range.index - 1);
    const offset = formats[TableCellBlock.blotName] ? 2 : 1;
    const base = new Delta()
      .retain(range.index)
      .concat(
        formats[TableCellBlock.blotName]
         ? new Delta().insert('\n')
         : new Delta()
      )
      .insert('\n', { [TableTemporary.blotName]: {} });
    const delta = new Array(rows).fill(0).reduce(memo => {
      const id = tableId();
      return new Array(columns).fill('\n').reduce((memo, text) => {
        return memo.insert(text, {
          [TableCellBlock.blotName]: cellId(),
          [TableCell.blotName]: { 'data-row': id, width: `${CELL_DEFAULT_WIDTH}` }
        });
      }, memo);
    }, base);
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.setSelection(range.index + offset, Quill.sources.SILENT);
    this.showTools();
  }

  private isReplace(range: Range, selectedTds: Element[], lines: any[]) {
    if (selectedTds.length === 1) {
      const cellBlot = Quill.find(selectedTds[0]);
      const containers = this.containers(cellBlot, range.index, range.length);
      const length = this.getLength(containers);
      const _length = this.getLength(lines);
      return length === _length;
    }
    return !!(selectedTds.length > 1);
  }

  // Inserting tables within tables is currently not supported
  private isTable(range: Range) {
    const formats = this.quill.getFormat(range.index);
    return !!formats[TableCellBlock.blotName];
  }

  private list(value: string, lines?: any[]) {
    const range = this.quill.getSelection();
    const selectedTds = this.cellSelection.selectedTds;
    if (selectedTds.length) {
      if (!lines) {
        if (!range.length && selectedTds.length === 1) {
          const [line] = this.quill.getLine(range.index);
          lines = [line];
        } else {
          lines = this.quill.getLines(range);
        }
      }
      return this.setTableListFormat(range, selectedTds, value, lines);
    }

    const formats = this.quill.getFormat(range);
    if (value === 'check') {
      if (formats.list === 'checked' || formats.list === 'unchecked') {
        this.quill.format('list', false, Quill.sources.USER);
      } else {
        this.quill.format('list', 'unchecked', Quill.sources.USER);
      }
    } else {
      this.quill.format('list', value, Quill.sources.USER);
    }
  }

  private setTableListFormat(
    range: Range,
    selectedTds: Element[],
    value: string,
    lines: any[]
  ) {
    let blot = null;
    const _isReplace = this.isReplace(range, selectedTds, lines);
    for (const line of lines) {
      blot = line.format('list', value, _isReplace);
    }
    if (selectedTds.length < 2) {
      if (_isReplace) {
        const cell = getCorrectCellBlot(blot);
        cell && this.cellSelection.setSelected(cell.domNode);
      }
      this.quill.setSelection(range, Quill.sources.SILENT);
    }
    return blot;
  }

  private showTools() {
    const [table, , cell] = this.getTable();
    if (!table || !cell) return;
    this.cellSelection.setDisabled(true);
    this.cellSelection.setSelected(cell.domNode);
    this.tableMenus.showMenus();
    this.tableMenus.updateMenus(table.domNode);
    this.tableMenus.updateTable(table.domNode);
  }

  private registerToolbarTable(toolbarTable: boolean) {
    if (!toolbarTable) return;
    Quill.register('formats/table-better', ToolbarTable, true);
    const toolbar = this.quill.getModule('toolbar');
    const button = toolbar.container.querySelector('button.ql-table-better');
    toolbar.addHandler('list', this.list.bind(this));
    if (!button) return;
    const selectContainer = ToolbarTable.createContainer();
    button.appendChild(selectContainer);
    button.addEventListener('click', (e: MouseEvent) => {
      ToolbarTable.handleClick(e, this.insertTable.bind(this));
    });
  }
}

const keyboardBindings = {
  'table-cell-block backspace': makeCellBlockHandler('Backspace'),
  'table-cell-block delete':  makeCellBlockHandler('Delete'),
  'table-list empty enter': {
    key: 'Enter',
    collapsed: true,
    format: ['table-list'],
    empty: true,
    handler(range: Range, context: Context) {
      const { line } = context;
      const cellId = line.parent.formats()[line.parent.statics.blotName];
      const blot = line.replaceWith(TableCellBlock.blotName, cellId);
      const tableModule = this.quill.getModule('table-better');
      const cell = getCorrectCellBlot(blot);
      cell && tableModule.cellSelection.setSelected(cell.domNode);
    }
  }
}

function makeCellBlockHandler(key: string) {
  return {
    key,
    format: ['table-cell-block'],
    collapsed: true,
    handler(range: Range, context: Context) {
      const [line] = this.quill.getLine(range.index);
      const { offset, suffix } = context;
      if (
        offset === 0 &&
        (
          !line.prev ||
          line.prev.statics.blotName !== 'table-cell-block'
        )
      ) {
        return false;
      }
      // Delete isn't from the end
      if (offset !== 0 && !suffix && key === 'Delete') {
        return false;
      }
      return true;
    }
  }
}

Table.keyboardBindings = keyboardBindings;

export default Table;