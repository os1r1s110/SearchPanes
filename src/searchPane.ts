import * as typeInterfaces from './paneType';
let DataTable = $.fn.dataTable;
export default class SearchPane {

	private static version = '1.0.1';

	private static classes: typeInterfaces.IClasses = {
		buttonGroup: 'dtsp-buttonGroup',
		buttonSub: 'dtsp-buttonSub',
		clear: 'dtsp-clear',
		clearAll: 'dtsp-clearAll',
		clearButton: 'clearButton',
		container: 'dtsp-searchPane',
		countButton: 'dtsp-countButton',
		disabledButton: 'dtsp-disabledButton',
		dull: 'dtsp-dull',
		hidden: 'dtsp-hidden',
		hide: 'dtsp-hide',
		layout: 'dtsp-',
		name: 'dtsp-name',
		nameButton: 'dtsp-nameButton',
		narrow: 'dtsp-narrow',
		paneButton: 'dtsp-paneButton',
		paneInputButton: 'dtsp-paneInputButton',
		pill: 'dtsp-pill',
		search: 'dtsp-search',
		searchCont: 'dtsp-searchCont',
		searchIcon: 'dtsp-searchIcon',
		searchLabelCont: 'dtsp-searchButtonCont',
		selected: 'dtsp-selected',
		smallGap: 'dtsp-smallGap',
		subRow1: 'dtsp-subRow1',
		subRow2: 'dtsp-subRow2',
		subRowsContainer: 'dtsp-subRowsContainer',
		title: 'dtsp-title',
		topRow: 'dtsp-topRow',
	};

	// Define SearchPanes default options
	private static defaults: typeInterfaces.IDefaults = {
		cascadePanes: false,
		clear: true,
		combiner: 'or',
		controls: true,
		container(dt) {
			return dt.table().container();
		},
		dataLength: 30,
		dtOpts: {},
		emptyMessage: '<i>No Data</i>',
		hideCount: false,
		layout: 'columns-3',
		orderable: true,
		orthogonal: {
			display: 'display',
			hideCount: false,
			search: 'filter',
			show: undefined,
			sort: 'sort',
			threshold: 0.6,
			type: 'type'
		},
		preSelect: [],
		threshold: 0.6,
		viewTotal: false,
	};

	public classes: typeInterfaces.IClasses;
	public dom: typeInterfaces.IDOM;
	public c: typeInterfaces.IDefaults;
	public s: typeInterfaces.IS;
	public colExists: boolean;
	public selections;
	public customPaneSettings: typeInterfaces.IConfigPaneItem;

	/**
	 * Creates the panes, sets up the search function
	 * @param paneSettings The settings for the searchPanes
	 * @param opts The options for the default features
	 * @param idx the index of the column for this pane
	 * @returns {object} the pane that has been created, including the table and the index of the pane
	 */
	constructor(paneSettings, opts, idx, layout, panesContainer, panes = null) {
		// Check that the required version of DataTables is included
		if (! DataTable || ! DataTable.versionCheck || ! DataTable.versionCheck('1.10.0')) {
			throw new Error('SearchPane requires DataTables 1.10 or newer');
		}

		// Check that Select is included
		if (! (DataTable as any).select) {
			throw new Error('SearchPane requires Select');
		}

		let table = new DataTable.Api(paneSettings);

		this.classes = $.extend(true, {}, SearchPane.classes);

		// Get options from user
		this.c = $.extend(true, {}, SearchPane.defaults, opts);

		this.customPaneSettings = panes;

		this.s = {
			cascadeRegen: false,
			clearing: false,
			colOpts: [],
			deselect: false,
			displayed: false,
			dt: table,
			dtPane: undefined,
			filteringActive: false,
			index: idx,
			indexes: [],
			lastSelect: false,
			listSet: false,
			redraw: false,
			rowData: {
				arrayFilter: [],
				arrayOriginal: [],
				arrayTotals: [],
				bins: {},
				binsOriginal: {},
				binsTotal: {},
				filterMap: new Map(),
				totalOptions: 0
			},
			searchFunction: undefined,
			selectPresent: false,
			updating: false,
		};

		let rowLength: number = table.columns().eq(0).toArray().length;
		this.colExists = this.s.index < rowLength;

		// Add extra elements to DOM object including clear and hide buttons
		this.c.layout = layout;
		let layVal: number = parseInt(layout.split('-')[1], 10);

		this.dom = {
			buttonGroup: $('<div/>').addClass(this.classes.buttonGroup),
			clear: $('<button type="button">&#215;</button>')
					.addClass(this.classes.dull)
					.addClass(this.classes.paneButton)
					.addClass(this.classes.clearButton),
			container: $('<div/>').addClass(this.classes.container).addClass(this.classes.layout +
					(layVal < 7 ? layout : layout.split('-')[0] + '-6')),
			countButton:  $('<button type="button"></button>')
							.addClass(this.classes.paneButton)
							.addClass(this.classes.countButton),
			dtP: $('<table><thead><tr><th>' +
				(this.colExists
					? $(table.column(this.colExists ? this.s.index : 0).header()).text()
					: this.customPaneSettings.header || 'Custom Pane') + '</th><th/></tr></thead></table>'),
			lower: $('<div/>').addClass(this.classes.subRow2).addClass(this.classes.narrowButton),
			nameButton: $('<button type="button"></button>').addClass(this.classes.paneButton).addClass(this.classes.nameButton),
			searchBox: $('<input/>').addClass(this.classes.paneInputButton).addClass(this.classes.search),
			searchButton: $('<button type = "button" class="' + this.classes.searchIcon + '"></button>')
					.addClass(this.classes.paneButton),
			searchCont: $('<div/>').addClass(this.classes.searchCont),
			searchLabelCont: $('<div/>').addClass(this.classes.searchLabelCont),
			topRow: $('<div/>').addClass(this.classes.topRow),
			upper: $('<div/>').addClass(this.classes.subRow1).addClass(this.classes.narrowSearch),
		};

		this.s.displayed = false;

		table = this.s.dt;
		this.selections = [];
		this.s.colOpts = this.colExists ? this._getOptions() : this._getBonusOptions();
		let colOpts =  this.s.colOpts;
		let clear: JQuery<HTMLElement> = $('<button type="button">X</button>').addClass(this.classes.paneButton);
		$(clear).text(table.i18n('searchPanes.clearPane', 'X'));
		this.dom.container.addClass(colOpts.className);
		this.dom.container.addClass(
			(this.customPaneSettings !== null && this.customPaneSettings.className !== undefined)
				? this.customPaneSettings.className
				: ''
		);

		$(panesContainer).append(this.dom.container);

		let tableNode: Node = table.table(0).node();

		// Custom search function for table
		this.s.searchFunction = (settings, searchData, dataIndex, origData) => {
			// If no data has been selected then show all
			if (this.selections.length === 0) {
				return true;
			}

			if (settings.nTable !== tableNode) {
				return true;
			}

			let filter: string | string[] = '';

			if (this.colExists) {
				// Get the current filtered data
				filter = searchData[this.s.index];

				if (colOpts.orthogonal.filter !== 'filter') {
					// get the filter value from the map
					filter = this.s.rowData.filterMap.get(dataIndex);

					if ((filter as any) instanceof $.fn.dataTable.Api) {
						filter = (filter as any).toArray();
					}
				}
			}

			return this._search(filter, dataIndex);
		};

		$.fn.dataTable.ext.search.push(this.s.searchFunction);

		// If the clear button for this pane is clicked clear the selections
		if (this.c.clear) {
			$(clear).on('click', () => {
				let searches = this.dom.container.find(this.classes.search);

				searches.each(function() {
					$(this).val('');
					$(this).trigger('input');
				});

				this.clearPane();
			});
		}

		// Sometimes the top row of the panes containing the search box and ordering buttons appears
		//  weird if the width of the panes is lower than expected, this fixes the design.
		// Equally this may occur when the table is resized.
		table.on('draw.dtsp', () => {
			this._adjustTopRow();
		});

		$(window).on('resize.dtsp', DataTable.util.throttle(() => {
			this._adjustTopRow();
		}));

		// When column-reorder is present and the columns are moved, it is necessary to
		//  reassign all of the panes indexes to the new index of the column.
		table.on('column-reorder.dtsp', (e, settings, details) => {
			this.s.index = details.mapping[this.s.index];
		});

		return this;
	}

	/**
	 * In the case of a rebuild there is potential for new data to have been included or removed
	 * so all of the rowData must be reset as a precaution.
	 */
	public clearData(): void {
		this.s.rowData = {
			arrayFilter: [],
			arrayOriginal: [],
			arrayTotals: [],
			bins: {},
			binsOriginal: {},
			binsTotal: {},
			filterMap: new Map(),
			totalOptions: 0,
		};
	}

	/**
	 * Clear the selections in the pane
	 */
	public clearPane(): this {
		// Deselect all rows which are selected and update the table and filter count.
		this.s.dtPane.rows({selected: true}).deselect();
		this.updateTable();
		return this;
	}

	/**
	 * Strips all of the SearchPanes elements from the document and turns all of the listeners for the buttons off
	 */
	public destroy(): void {
		$(this.s.dtPane).off('.dtsp');
		$(this.s.dt).off('.dtsp');

		$(this.dom.nameButton).off('.dtsp');
		$(this.dom.countButton).off('.dtsp');
		$(this.dom.clear).off('.dtsp');
		$(this.dom.searchButton).off('.dtsp');

		$(this.dom.container).remove();

		let searchIdx: number = $.fn.dataTable.ext.search.indexOf(this.s.searchFunction);

		while (searchIdx !== -1) {
			$.fn.dataTable.ext.search.splice(searchIdx, 1);
			searchIdx = $.fn.dataTable.ext.search.indexOf(this.s.searchFunction);
		}

		// If the datatables have been defined for the panes then also destroy these
		if (this.s.dtPane !== undefined) {
			this.s.dtPane.destroy();
		}
	}

	/**
	 * Updates the number of filters that have been applied in the title
	 */
	public getPaneCount(): number {
		return this.s.dtPane !== undefined ?
			this.s.dtPane.rows({selected: true}).data().toArray().length :
			0;
	}

	/**
	 * Rebuilds the panes from the start having deleted the old ones
	 */
	public rebuildPane(maintainSelection = false): this {
		this.clearData();

		let selectedRows = [];
		// When rebuilding strip all of the HTML Elements out of the container and start from scratch
		if (this.s.dtPane !== undefined) {
			if (maintainSelection) {
				selectedRows = this.s.dtPane.rows({selected: true}).data().toArray();
			}
			this.s.dtPane.clear().destroy();
		}

		this.dom.container.removeClass(this.classes.hidden);
		this.s.displayed = false;
		this._buildPane(selectedRows);
		return this;
	}

	/**
	 * removes the pane from the page and sets the displayed property to false.
	 */
	public removePane(): void {
		this.s.displayed = false;
		$(this.dom.container).hide();
	}

	/**
	 * Sets the cascadeRegen property of the pane. Accessible from above because as SearchPanes.ts deals with the rebuilds.
	 * @param val the boolean value that the cascadeRegen property is to be set to
	 */
	public setCascadeRegen(val: boolean): void {
		this.s.cascadeRegen = val;
	}

	/**
	 * This function allows the clearing property to be assigned. This is used when implementing cascadePane.
	 * In setting this to true for the clearing of the panes selection on the deselects it forces the pane to
	 * repopulate from the entire dataset not just the displayed values.
	 * @param val the boolean value which the clearing property is to be assigned
	 */
	public setClear(val: boolean): void {
		this.s.clearing = val;
	}

	/**
	 * Updates the values of all of the panes
	 * @param draw whether this has been triggered by a draw event or not
	 */
	public updatePane(draw: boolean = false): void {
		this.s.updating = true;
		this._updateCommon(draw);
		this.s.updating = false;
	}

	/**
	 * Updates the panes if one of the options to do so has been set to true
	 *   rather than the filtered message when using viewTotal.
	 */
	public updateTable(): void {
		let selectedRows = this.s.dtPane.rows({selected: true}).data().toArray();
		this.selections = selectedRows;
		this._searchExtras();

		// If either of the options that effect how the panes are displayed are selected then update the Panes
		if (this.c.cascadePanes || this.c.viewTotal) {
			this.updatePane();
		}
	}

	/**
	 * Takes in potentially undetected rows and adds them to the array if they are not yet featured
	 * @param filter the filter value of the potential row
	 * @param display the display value of the potential row
	 * @param sort the sort value of the potential row
	 * @param type the type value of the potential row
	 * @param arrayFilter the array to be populated
	 * @param bins the bins to be populated
	 */
	private _addOption(
		filter,
		display,
		sort,
		type,
		arrayFilter,
		bins: {[keys: string]: number}
	) {
		// If the filter is an array then take a note of this, and add the elements to the arrayFilter array
		if (Array.isArray(filter) || filter instanceof DataTable.Api) {
			// Convert to an array so that we can work with it
			if (filter instanceof DataTable.Api) {
				filter = filter.toArray();
				display = display.toArray();
			}

			if (filter.length === display.length) {
				for (let i: number = 0; i < filter.length; i++) {
					// If we haven't seen this row before add it
					if (!bins[filter[i]]) {
						bins[filter[i]] = 1;
						arrayFilter.push({
							display: display[i],
							filter: filter[i],
							sort,
							type
						});
					}
					// Otherwise just increment the count
					else {
						bins[filter[i]]++;
					}
					this.s.rowData.totalOptions++;
				}
				return;
			}
			else {
				throw new Error('display and filter not the same length');
			}
		}
		// If the values were affected by othogonal data and are not an array then check if it is already present
		else if (typeof this.s.colOpts.orthogonal === 'string') {
			if (!bins[filter]) {
				bins[filter] = 1;
				arrayFilter.push({
					display,
					filter,
					sort,
					type
				});
				this.s.rowData.totalOptions++;
			}
			else {
				bins[filter]++;
				this.s.rowData.totalOptions++;
				return;
			}
		}
		// Otherwise we must just be adding an option
		else {
			arrayFilter.push({
				display,
				filter,
				sort,
				type
			});
		}
	}

	/**
	 * Adds a row to the panes table
	 * @param display the value to be displayed to the user
	 * @param filter the value to be filtered on when searchpanes is implemented
	 * @param shown the number of rows in the table that are currently visible matching this criteria
	 * @param total the total number of rows in the table that match this criteria
	 * @param sort the value to be sorted in the pane table
	 * @param type the value of which the type is to be derived from
	 */
	private _addRow(display, filter, shown: number, total: number | string, sort, type): any {
		let index: number;

		for (let entry of this.s.indexes) {
			if (entry.filter === filter) {
				index = entry.index;
			}
		}

		if (index === undefined) {
			index = this.s.indexes.length;
			this.s.indexes.push({filter, index});
		}

		return this.s.dtPane.row.add({
			display: display !== '' ? display : this.c.emptyMessage,
			filter,
			index,
			shown,
			sort: sort !== '' ? sort : this.c.emptyMessage,
			total,
			type,
		});
	}

	/**
	 * Adjusts the layout of the top row when the screen is resized
	 */
	private _adjustTopRow(): void {
		let subContainers = this.dom.container.find('.' + this.classes.subRowsContainer);
		let subRow1 = this.dom.container.find('.dtsp-subRow1');
		let subRow2 = this.dom.container.find('.dtsp-subRow2');
		let topRow = this.dom.container.find('.' + this.classes.topRow);

		// If the width is 0 then it is safe to assume that the pane has not yet been displayed.
		//  Even if it has, if the width is 0 it won't make a difference if it has the narrow class or not
		if (($(subContainers[0]).width() < 252 || $(topRow[0]).width() < 252) && $(subContainers[0]).width() !== 0) {
			$(subContainers[0]).addClass(this.classes.narrow);
			$(subRow1[0]).addClass(this.classes.narrowSub).removeClass(this.classes.narrowSearch);
			$(subRow2[0]).addClass(this.classes.narrowSub).removeClass(this.classes.narrowButton);
		}
		else {
			$(subContainers[0]).removeClass(this.classes.narrow);
			$(subRow1[0]).removeClass(this.classes.narrowSub).addClass(this.classes.narrowSearch);
			$(subRow2[0]).removeClass(this.classes.narrowSub).addClass(this.classes.narrowButton);
		}
	}

	/**
	 * Method to construct the actual pane.
	 */
	private _buildPane(selectedRows = []): boolean {
		// Aliases
		this.selections = [];
		let table = this.s.dt;
		let column = table.column(this.colExists ? this.s.index : 0);
		let colOpts =  this.s.colOpts;
		let rowData = this.s.rowData;

		// Other Variables
		let countMessage: string = table.i18n('searchPanes.count', '{total}');
		let filteredMessage: string = table.i18n('searchPanes.countFiltered', '{shown} ({total})');
		let loadedFilter = table.state.loaded();

		// If it is not a custom pane in place
		if (this.colExists) {
			let idx: number = -1;

			if (loadedFilter && loadedFilter.searchPanes && loadedFilter.searchPanes.panes) {
				for (let i: number = 0; i < loadedFilter.searchPanes.panes.length; i++) {
					if (loadedFilter.searchPanes.panes[i].id === this.s.index) {
						idx = i;
						break;
					}
				}
			}

			// Perform checks that do not require populate pane to run
			if ((colOpts.show === false
				|| (colOpts.show !== undefined && colOpts.show !== true)) &&
				idx === -1
			) {
					this.dom.container.addClass(this.classes.hidden);
					this.s.displayed = false;
					return false;
			}
			else if (colOpts.show === true || idx !== -1) {
				this.s.displayed = true;
			}

			// Only run populatePane if the data has not been collected yet
			if (rowData.arrayFilter.length === 0) {
				this._populatePane();

				if (loadedFilter && loadedFilter.searchPanes && loadedFilter.searchPanes.panes) {
					// If the index is not found then no data has been added to the state for this pane,
					//  which will only occur if it has previously failed to meet the criteria to be
					//  displayed, therefore we can just hide it again here
					if (idx !== -1) {
						rowData.binsOriginal = loadedFilter.searchPanes.panes[idx].bins;
						rowData.arrayOriginal = loadedFilter.searchPanes.panes[idx].arrayFilter;
					}
					else {
						this.dom.container.addClass(this.classes.hidden);
						this.s.displayed = false;
						return;
					}
				}
				else {
					rowData.arrayOriginal = rowData.arrayFilter;
					rowData.binsOriginal = rowData.bins;
				}
			}

			let binLength: number = Object.keys(rowData.binsOriginal).length;
			let uniqueRatio: number = this._uniqueRatio(binLength, table.rows()[0].length);

			// Don't show the pane if there isn't enough variance in the data, or there is only 1 entry for that pane
			if (this.s.displayed === false && ((colOpts.show === undefined && colOpts.threshold === null ?
					uniqueRatio > this.c.threshold :
					uniqueRatio > colOpts.threshold)
				|| (colOpts.show !== true  && binLength <= 1))
			) {
				this.dom.container.addClass(this.classes.hidden);
				this.s.displayed = false;
				return;

			}

			// If the option viewTotal is true then find
			// the total count for the whole table to display alongside the displayed count
			if (this.c.viewTotal && rowData.arrayTotals.length === 0) {
				this._detailsPane();
			}
			else {
				rowData.binsTotal = rowData.bins;
			}

			this.dom.container.addClass(this.classes.show);
			this.s.displayed = true;
		}
		else {
			this.s.displayed = true;
		}

		// If the variance is accceptable then display the search pane
		this._displayPane();

		if (!this.s.listSet) {
			// Here, when the state is loaded if the data object on the original table is empty,
			//  then a state.clear() must have occurred, so delete all of the panes tables state objects too.
			this.dom.dtP.on('stateLoadParams.dt', (e, settings, data) => {
				if ($.isEmptyObject(table.state.loaded())) {
					$.each(data, (index, value) => {
						delete data[index];
					});
				}
			});
		}

		// Declare the datatable for the pane
		let errMode: string = $.fn.dataTable.ext.errMode;
		$.fn.dataTable.ext.errMode = 'none';
		let haveScroller = (DataTable as any).Scroller;
		this.s.dtPane = $(this.dom.dtP).DataTable($.extend(
			true,
			{
				columnDefs: [
					{
						className: 'dtsp-nameColumn',
						data: 'display',
						render: (data, type, row) => {
							if (type === 'sort') {
								return row.sort;
							}
							else if (type === 'type') {
								return row.type;
							}

							let message: string;
							this.s.filteringActive && this.c.viewTotal
								? message = filteredMessage.replace(/{total}/, row.total)
								: message = countMessage.replace(/{total}/, row.total) ;
							message = message.replace(/{shown}/, row.shown);

							while (message.indexOf('{total}') !== -1) {
								message = message.replace(/{total}/, row.total);
							}

							while (message.indexOf('{shown}') !== -1) {
								message = message.replace(/{shown}/, row.shown);
							}

							// We are displaying the count in the same columne as the name of the search option.
							// This is so that there is not need to call columns.adjust(), which in turn speeds up the code
							let displayMessage: string = '';
							let pill: string = '<span class="' + this.classes.pill + '">' + message + '</span>';

							if (this.c.hideCount || colOpts.hideCount) {
								pill = '';
							}

							if (!this.c.dataLength) {
								displayMessage = '<span class="' + this.classes.name + '">' + data + '</span>' + pill;
							}
							else if (data.length > this.c.dataLength) {
								displayMessage = '<span class="' + this.classes.name + '">'
												+ data.substr(0, this.c.dataLength) + '...'
												+ '</span>'
												+ pill;
							}
							else {
								displayMessage = '<span class="' + this.classes.name + '">' + data  + '</span>' + pill;
							}

							return displayMessage;
						},
						targets: 0,
						// Accessing the private datatables property to set type based on the original table.
						// This is null if not defined by the user, meaning that automatic type detection would take place
						type: table.settings()[0].aoColumns[this.s.index] !== undefined ?
							table.settings()[0].aoColumns[this.s.index]._sManualType :
							null,
					},
					{
						className: 'dtsp-countColumn ' + this.classes.badgePill,
						data: 'total',
						targets: 1,
						visible: false
					}
				],
				deferRender: true,
				dom: 't',
				info: false,
				paging: haveScroller ? true : false,
				scrollY: '200px',
				scroller: haveScroller ? true : false,
				select: true,
				stateSave: table.settings()[0].oFeatures.bStateSave ? true : false,
			},
			this.c.dtOpts, colOpts !== undefined ? colOpts.dtOpts : {},
			(this.customPaneSettings !== null && this.customPaneSettings.dtOpts !== undefined)
			? this.customPaneSettings.dtOpts
			: {}
		));

		$(this.dom.dtP).addClass(this.classes.table);

		// This is hacky but necessary for when datatables is generating the column titles automatically
		$(this.dom.searchBox).attr(
			'placeholder',
			colOpts.header !== undefined
			? colOpts.header
			: this.colExists
				? table.settings()[0].aoColumns[this.s.index].sTitle
				: this.customPaneSettings.header || 'Custom Pane'
		);

		// As the pane table is not in the document yet we must initialise select ourselves
		($.fn.dataTable as any).select.init(this.s.dtPane);
		$.fn.dataTable.ext.errMode = errMode;

		// If it is not a custom pane
		if (this.colExists) {
			// On initialisation, do we need to set a filtering value from a
			// saved state or init option?
			let search = column.search();
			search = search ? search.substr(1, search.length - 2).split('|') : [];

			// Count the number of empty cells
			let count: number = 0;
			rowData.arrayFilter.forEach(element => {
				if (element.filter === '') {
					count++;
				}
			});

			// Add all of the search options to the pane
			for (let i: number = 0, ien = rowData.arrayFilter.length; i < ien; i++) {
				if (rowData.arrayFilter[i] && (rowData.bins[rowData.arrayFilter[i].filter] !== undefined || !this.c.cascadePanes)) {
					let row = this._addRow(
						rowData.arrayFilter[i].display,
						rowData.arrayFilter[i].filter,
						rowData.bins[rowData.arrayFilter[i].filter],
						rowData.binsTotal[rowData.arrayFilter[i].filter],
						rowData.arrayFilter[i].sort,
						rowData.arrayFilter[i].type
					);

					if (colOpts.preSelect !== undefined && colOpts.preSelect.indexOf(rowData.arrayFilter[i].filter) !== -1) {
						row.select();
					}
				}
				else {
					this._addRow(this.c.emptyMessage, count, count, this.c.emptyMessage, this.c.emptyMessage, this.c.emptyMessage);
				}
			}
		}

		// If there are custom options set or it is a custom pane then get them
		if (colOpts.options !== undefined ||
			(this.customPaneSettings !== null && this.customPaneSettings.options !== undefined)) {
				this._getComparisonRows();
		}

		(DataTable as any).select.init(this.s.dtPane);

		// Display the pane
		this.s.dtPane.draw();

		if (!this.s.listSet) {
			this._setListeners();
			this.s.listSet = true;
		}

		for (let selection of selectedRows) {
			for (let row of this.s.dtPane.rows().toArray()) {
				if (selection.value === this.s.dtPane.row(row).data().value) {
					this.s.dtPane.row(row).select();
				}
			}
		}

		// Reload the selection, searchbox entry and ordering from the previous state
		if (loadedFilter && loadedFilter.searchPanes && loadedFilter.searchPanes.panes) {
			if (!this.c.cascadePanes) {
				this._reloadSelect(loadedFilter);
			}

			for (let pane of loadedFilter.searchPanes.panes) {
				if (pane.id === this.s.index) {
					$(this.dom.searchBox).val(pane.searchTerm);
					this.s.dt.order(pane.order);
				}
			}
		}

		// Make sure to save the state once the pane has been built
		this.s.dt.state.save();
		return true;
	}

	/**
	 * Sets the listeners for the pane.
	 *
	 * Having it in it's own function makes it easier to only set them once
	 */
	private _setListeners() {
		let rowData = this.s.rowData;

		// When an item is selected on the pane, add these to the array which holds selected items.
		// Custom search will perform.
		this.s.dtPane.on('select.dtsp', () => {
			clearTimeout(t0);
			$(this.dom.clear).removeClass(this.classes.dull);
			this.s.selectPresent = true;
			if (!this.s.updating) {
				this._makeSelection();
			}
			this.s.selectPresent = false;
		});

		// When saving the state store all of the selected rows for preselection next time around
		this.s.dt.on('stateSaveParams.dtsp', (e, settings, data) => {
			// If the data being passed in is empty then a state clear must have occured so clear the panes state as well
			if ($.isEmptyObject(data)) {
				this.s.dtPane.state.clear();
				return;
			}

			let selected = [];
			let searchTerm: string | number | string[];
			let order;
			let bins;
			let arrayFilter;

			// Get all of the data needed for the state save from the pane
			if (this.s.dtPane !== undefined) {
				selected = this.s.dtPane.rows({selected: true}).data().map(item => item.filter.toString()).toArray();
				searchTerm = $(this.dom.searchBox).val();
				order = this.s.dtPane.order();
				bins = rowData.binsOriginal;
				arrayFilter = rowData.arrayOriginal;
			}

			if (data.searchPanes === undefined) {
				data.searchPanes = {};
			}

			if (data.searchPanes.panes === undefined) {
				data.searchPanes.panes = [];
			}

			// Add the panes data to the state object
			data.searchPanes.panes.push({
				arrayFilter,
				bins,
				id: this.s.index,
				order,
				searchTerm,
				selected,
			});
		});

		this.s.dtPane.on('user-select.dtsp', (e, _dt, type, cell, originalEvent) => {
			originalEvent.stopPropagation();
		});

		// When the button to order by the name of the options is clicked then
		//  change the ordering to whatever it isn't currently
		$(this.dom.nameButton).on('click.dtsp', () => {
			let currentOrder = this.s.dtPane.order()[0][1];
			this.s.dtPane.order([0, currentOrder === 'asc' ? 'desc' : 'asc']).draw();
		});

		// When the button to order by the number of entries in the column is clicked then
		//  change the ordering to whatever it isn't currently
		$(this.dom.countButton).on('click.dtsp', () => {
			let currentOrder = this.s.dtPane.order()[0][1];
			this.s.dtPane.order([1, currentOrder === 'asc' ? 'desc' : 'asc']).draw();
		});

		// When the clear button is clicked reset the pane
		$(this.dom.clear).on('click.dtsp', () => {
			let searches = this.dom.container.find('.' + this.classes.search);

			searches.each(function() {
				// set the value of the search box to be an empty string and then search on that, effectively reseting
				$(this).val('');
				$(this).trigger('input');
			});

			this.clearPane();
		});

		// When the search button is clicked then draw focus to the search box
		$(this.dom.searchButton).on('click.dtsp', () => {
			$(this.dom.searchBox).focus();
		});

		// When a character is inputted into the searchbox search the pane for matching values.
		// Doing it this way means that no button has to be clicked to trigger a search, it is done asynchronously
		$(this.dom.searchBox).on('input.dtsp', () => {
			this.s.dtPane.search($(this.dom.searchBox).val()).draw();
			this.s.dt.state.save();
		});

		// Declare timeout Variable
		let t0: NodeJS.Timeout;

		// When an item is deselected on the pane, re add the currently selected items to the array
		// which holds selected items. Custom search will be performed.
		this.s.dtPane.on('deselect.dtsp', () => {
			t0 = setTimeout(() => {
				this.s.deselect = true;

				if (this.s.dtPane.rows({selected: true}).data().toArray().length === 0) {
					$(this.dom.clear).addClass(this.classes.dull);
				}

				this._makeSelection();
				this.s.deselect = false;
				this.s.dt.state.save();
			}, 50);
		});
	}

	/**
	 * Update the array which holds the display and filter values for the table
	 */
	private _detailsPane(): void {
		let table = this.s.dt;
		this.s.rowData.arrayTotals = [];
		this.s.rowData.binsTotal = {};
		let settings = this.s.dt.settings()[0];
		table.rows().every((rowIdx) => {
			this._populatePaneArray(rowIdx, this.s.rowData.arrayTotals, settings, this.s.rowData.binsTotal);
		});
	}

	/**
	 * Appends all of the HTML elements to their relevant parent Elements
	 */
	private _displayPane(): void {
		let container = this.dom.container;
		let colOpts =  this.s.colOpts;
		let layVal: number = parseInt(this.c.layout.split('-')[1], 10);

		//  Empty everything to start again
		$(this.dom.topRow).empty();
		$(this.dom.dtP).empty();
		$(this.dom.topRow).addClass(this.classes.topRow);

		// If there are more than 3 columns defined then make there be a smaller gap between the panes
		if (layVal > 3) {
			$(this.dom.container).addClass(this.classes.smallGap);
		}

		$(this.dom.topRow).addClass(this.classes.subRowsContainer);
		$(this.dom.upper).appendTo(this.dom.topRow);
		$(this.dom.lower).appendTo(this.dom.topRow);
		$(this.dom.searchCont).appendTo(this.dom.upper);
		$(this.dom.buttonGroup).appendTo(this.dom.lower);

		// If no selections have been made in the pane then disable the clear button
		if (this.c.dtOpts.searching === false ||
			(colOpts.dtOpts !== undefined &&
			colOpts.dtOpts.searching === false) ||
			(!this.c.controls || !colOpts.controls) ||
			(this.customPaneSettings !== null &&
				this.customPaneSettings.dtOpts !== undefined &&
				this.customPaneSettings.dtOpts.searching !== undefined &&
				!this.customPaneSettings.dtOpts.searching)
		) {
			$(this.dom.searchBox).attr('disabled', 'disabled')
				.removeClass(this.classes.paneInputButton)
				.addClass(this.classes.disabledButton);
		}
		$(this.dom.searchBox).appendTo(this.dom.searchCont);

		// Create the contents of the searchCont div. Worth noting that this function will change when using semantic ui
		this._searchContSetup();

		// If the clear button is allowed to show then display it
		if (this.c.clear  && this.c.controls && colOpts.controls) {
			$(this.dom.clear).appendTo(this.dom.buttonGroup);
		}

		if (this.c.orderable && colOpts.orderable && this.c.controls && colOpts.controls) {
			$(this.dom.nameButton).appendTo(this.dom.buttonGroup);
		}

		// If the count column is hidden then don't display the ordering button for it
		if (
			!this.c.hideCount &&
			!colOpts.hideCount &&
			this.c.orderable &&
			colOpts.orderable &&
			this.c.controls &&
			colOpts.controls
		) {
			$(this.dom.countButton).appendTo(this.dom.buttonGroup);
		}

		$(this.dom.topRow).prependTo(this.dom.container);
		$(container).append(this.dom.dtP);
		$(container).show();
	}

	/**
	 * Gets the options for the row for the customPanes
	 * @returns {object} The options for the row extended to include the options from the user.
	 */
	private _getBonusOptions(): {[keys: string]: any} {
		// We need to reset the thresholds as if they have a value in colOpts then that value will be used
		let defaultMutator = {
			orthogonal: {
				threshold: null
			},
			threshold: null
		};
		return $.extend(
			true,
			{},
			SearchPane.defaults,
			defaultMutator,
			this.c !== undefined ? this.c : {}
		);
	}

	/**
	 * Adds the custom options to the pane
	 * @returns {Array} Returns the array of rows which have been added to the pane
	 */
	private _getComparisonRows() {
		let colOpts = this.s.colOpts;
		// Find the appropriate options depending on whether this is a pane for a specific column or a custom pane
		let options = colOpts.options !== undefined
			? colOpts.options
			: this.customPaneSettings !== null && this.customPaneSettings.options !== undefined
				? this.customPaneSettings.options
				: undefined;

		if (options === undefined) {
			return;
		}

		let tableVals = this.s.dt.rows({search: 'applied'}).data().toArray();
		let appRows = this.s.dt.rows({search: 'applied'});
		let tableValsTotal = this.s.dt.rows().data().toArray();
		let allRows = this.s.dt.rows();
		let rows = [];
		// Clear all of the other rows from the pane, only custom options are to be displayed when they are defined
		this.s.dtPane.clear();

		for (let comp of options) {
			// Initialise the object which is to be placed in the row
			let insert: string = comp.label !== '' ? comp.label : this.c.emptyMessage;
			let comparisonObj = {
				display: insert,
				filter: typeof comp.value === 'function' ? comp.value : [],
				shown: 0,
				sort: insert,
				total: 0,
				type: insert,
			};

			// If a custom function is in place
			if (typeof comp.value === 'function') {

				// Count the number of times the function evaluates to true for the data currently being displayed
				for (let tVal: number = 0; tVal < tableVals.length; tVal++) {
					if (comp.value.call(this.s.dt, tableVals[tVal], appRows[0][tVal])) {
						comparisonObj.shown++;
					}
				}

				// Count the number of times the function evaluates to true for the original data in the Table
				for (let i: number = 0; i < tableValsTotal.length; i++) {
					if (comp.value.call(this.s.dt, tableValsTotal[i], allRows[0][i])) {
						comparisonObj.total++;
					}
				}

				// Update the comparisonObj
				if (typeof comparisonObj.filter !== 'function') {
					comparisonObj.filter.push(comp.filter);
				}
			}

			// If cascadePanes is not active or if it is and the comparisonObj should be shown then add it to the pane
			if (!this.c.cascadePanes || (this.c.cascadePanes && comparisonObj.shown !== 0)) {
				rows.push(this._addRow(
					comparisonObj.display,
					comparisonObj.filter,
					comparisonObj.shown,
					comparisonObj.total,
					comparisonObj.sort,
					comparisonObj.type
				));
			}
		}

		return rows;
	}

	/**
	 * Gets the options for the row for the customPanes
	 * @returns {object} The options for the row extended to include the options from the user.
	 */
	private _getOptions(): {[keys: string]: any} {
		let table = this.s.dt;
		// We need to reset the thresholds as if they have a value in colOpts then that value will be used
		let defaultMutator = {
			orthogonal: {
				threshold: null
			},
			threshold: null
		};
		return $.extend(
			true,
			{},
			SearchPane.defaults,
			defaultMutator,
			table.settings()[0].aoColumns[this.s.index].searchPanes
		);
	}

	/**
	 * This method allows for changes to the panes and table to be made when a selection or a deselection occurs
	 * @param select Denotes whether a selection has been made or not
	 */
	private _makeSelection() {
		this.updateTable();
		this.s.updating = true;
		this.s.dt.draw();
		this.s.updating = false;
	}

	/**
	 * Fill the array with the values that are currently being displayed in the table
	 */
	private _populatePane(): void {
		let table = this.s.dt;
		this.s.rowData.arrayFilter = [];
		this.s.rowData.bins = {};
		let settings = this.s.dt.settings()[0];

		// If cascadePanes or viewTotal are active it is necessary to get the data which is currently
		//  being displayed for their functionality.
		let indexArray = (this.c.cascadePanes || this.c.viewTotal) && !this.s.clearing ?
			table.rows({search: 'applied'}).indexes() :
			table.rows().indexes();

		for (let index of indexArray) {
			this._populatePaneArray(index, this.s.rowData.arrayFilter, settings);
		}
	}

	/**
	 * Populates an array with all of the data for the table
	 * @param rowIdx The current row index to be compared
	 * @param arrayFilter The array that is to be populated with row Details
	 * @param bins The bins object that is to be populated with the row counts
	 */
	private _populatePaneArray(
		rowIdx: number,
		arrayFilter: typeInterfaces.IDataArray[],
		settings,
		bins: {[keys: string]: number} = this.s.rowData.bins
	): void {
		let colOpts = this.s.colOpts;

		// Retrieve the rendered data from the cell using the fnGetCellData function
		//  rather than the cell().render API method for optimisation
		if (typeof colOpts.orthogonal === 'string') {
			let rendered = settings.oApi._fnGetCellData(settings, rowIdx, this.s.index, colOpts.orthogonal);
			this.s.rowData.filterMap.set(rowIdx, rendered);
			this._addOption(rendered, rendered, rendered, rendered, arrayFilter, bins);
		}
		else {
			let filter = settings.oApi._fnGetCellData(settings, rowIdx, this.s.index, colOpts.orthogonal.search);
			this.s.rowData.filterMap.set(rowIdx, filter);

			if (!bins[filter]) {
				bins[filter] = 1;
				this._addOption(
					filter,
					settings.oApi._fnGetCellData(settings, rowIdx, this.s.index, colOpts.orthogonal.display),
					settings.oApi._fnGetCellData(settings, rowIdx, this.s.index, colOpts.orthogonal.sort),
					settings.oApi._fnGetCellData(settings, rowIdx, this.s.index, colOpts.orthogonal.type),
					arrayFilter,
					bins
				);
				this.s.rowData.totalOptions++;
			}
			else {
				bins[filter] ++;
				this.s.rowData.totalOptions++;
				return;
			}
		}

	}

	/**
	 * Reloads all of the previous selects into the panes
	 * @param loadedFilter The loaded filters from a previous state
	 */
	private _reloadSelect(loadedFilter): void {
		// If the state was not saved don't selected any
		if (loadedFilter === undefined) {
				return;
		}

		let idx: number;

		// For each pane, check that the loadedFilter list exists and is not null,
		// find the id of each search item and set it to be selected.
		for (let i: number = 0; i < loadedFilter.searchPanes.panes.length; i++) {
			if (loadedFilter.searchPanes.panes[i].id === this.s.index) {
				idx = i;
				break;
			}
		}

		if (idx !== undefined) {
			let table = this.s.dtPane;
			let rows = table.rows({order: 'index'}).data().map(
				item => item.filter !== null ?
				item.filter.toString() :
				null
			).toArray();

			for (let filter of loadedFilter.searchPanes.panes[idx].selected) {
				let id: number = -1;

				if (filter !== null) {
					id = rows.indexOf(filter.toString());
				}

				if (id > -1) {
					table.row(id).select();
					this.s.dt.state.save();
				}
			}

		}
	}

	/**
	 * This method decides whether a row should contribute to the pane or not
	 * @param filter the value that the row is to be filtered on
	 * @param dataIndex the row index
	 */
	private _search(filter, dataIndex: number): boolean {
		let colOpts = this.s.colOpts;
		let table = this.s.dt;

		// For each item selected in the pane, check if it is available in the cell
		for (let colSelect of this.selections) {
			// if the filter is an array then is the column present in it
			if (Array.isArray(filter)) {
				if (filter.indexOf(colSelect.filter) !== -1) {
					return true;
				}
			}
			// if the filter is a function then does it meet the criteria of that function or not
			else if (typeof colSelect.filter === 'function') {
				if (colSelect.filter.call(table, table.row(dataIndex).data(), dataIndex)) {
					if (colOpts.combiner === 'or') {
						return true;
					}
				}
				// If the combiner is an "and" then we need to check against all possible selections
				//  so if it fails here then the and is not met and return false
				else if (colOpts.combiner === 'and') {
					return false;
				}
			}
			// otherwise if the two filter values are equal then return true
			else if (filter === colSelect.filter) {
				return true;
			}
		}

		// If the combiner is an and then we need to check against all possible selections
		//  so return true here if so because it would have returned false earlier if it had failed
		if (colOpts.combiner === 'and') {
			return true;
		}
		// Otherwise it hasn't matched with anything by this point so it must be false
		else {
			return false;
		}
	}

	/**
	 * Creates the contents of the searchCont div
	 *
	 * NOTE This is overridden when semantic ui styling in order to integrate the search button into the text box.
	 */
	private _searchContSetup(): void {
		if (this.c.controls && this.s.colOpts.controls) {
			$(this.dom.searchButton).appendTo(this.dom.searchLabelCont);
		}

		if (
			!(this.c.dtOpts.searching === false ||
			this.s.colOpts.dtOpts.searching === false ||
			(this.customPaneSettings !== null &&
				this.customPaneSettings.dtOpts !== undefined &&
				this.customPaneSettings.dtOpts.searching !== undefined &&
				!this.customPaneSettings.dtOpts.searching))
		) {
			$(this.dom.searchLabelCont).appendTo(this.dom.searchCont);
		}
	}

	/**
	 * Adds outline to the pane when a selection has been made
	 */
	private _searchExtras(): void {
		let updating = this.s.updating;
		this.s.updating = true;
		let filters = this.s.dtPane.rows({selected: true}).data().pluck('filter').toArray();
		let nullIndex: number = filters.indexOf(this.c.emptyMessage);
		let container = $(this.s.dtPane.table().container());

		// If null index is found then search for empty cells as a filter.
		if (nullIndex > -1) {
			filters[nullIndex] = '';
		}

		// If a filter has been applied then outline the respective pane, remove it when it no longer is.
		if (filters.length > 0) {
			container.addClass(this.classes.selected);
		}
		else if (filters.length === 0) {
			container.removeClass(this.classes.selected);
		}

		this.s.updating = updating;
	}

	/**
	 * Finds the ratio of the number of different options in the table to the number of rows
	 * @param bins the number of different options in the table
	 * @param rowCount the total number of rows in the table
	 * @returns {number} returns the ratio
	 */
	private _uniqueRatio(bins: number, rowCount: number): number {
		if (rowCount > 0 && this.s.rowData.totalOptions > 0) {
			return bins / this.s.rowData.totalOptions;
		}
		else {
			return 1;
		}
	}

	/**
	 * updates the options within the pane
	 * @param draw a flag to define whether this has been called due to a draw event or not
	 */
	private _updateCommon(draw: boolean = false): void {
		// Update the panes if doing a deselect. if doing a select then
		// update all of the panes except for the one causing the change
		if (
			this.s.dtPane !== undefined &&
			((!this.s.filteringActive || this.c.cascadePanes) || draw === true) &&
			(this.c.cascadePanes !== true || this.s.selectPresent !== true) && !this.s.lastSelect
		) {
			let colOpts = this.s.colOpts;
			let selected = this.s.dtPane.rows({selected: true}).data().toArray();
			// Got an error where this would crash because .parent() returned an empty set, then parent()[0] did not exist and crashed 
			let scrollTop = $(this.s.dtPane.table().node()).parent()[0].scrollTop;
			let rowData = this.s.rowData;

			// Clear the pane in preparation for adding the updated search options
			this.s.dtPane.clear();

			// If it is not a custom pane
			if (this.colExists) {
				// Only run populatePane if the data has not been collected yet
				if (rowData.arrayFilter.length === 0) {
					this._populatePane();
				}
				// If cascadePanes is active and the table has returned to its default state then
				//  there is a need to update certain parts ofthe rowData.
				else if (
					this.c.cascadePanes
					&& this.s.dt.rows().data().toArray().length === this.s.dt.rows({search: 'applied'}).data().toArray().length
				) {
					rowData.arrayFilter = rowData.arrayOriginal;
					rowData.bins = rowData.binsOriginal;
				}
				// Otherwise if viewTotal or cascadePanes is active then the data from the table must be read.
				else if (this.c.viewTotal || this.c.cascadePanes) {
					this._populatePane();
				}

				// If the viewTotal option is selected then find the totals for the table
				if (this.c.viewTotal) {
					this._detailsPane();
				}
				else {
					rowData.binsTotal = rowData.bins;
				}

				if (this.c.viewTotal && !this.c.cascadePanes) {
					rowData.arrayFilter = rowData.arrayTotals;
				}

				for (let dataP of rowData.arrayFilter) {
					// If both view Total and cascadePanes have been selected and the count of the row is not 0 then add it to pane
					// Do this also if the viewTotal option has been selected and cascadePanes has not
					if (dataP && (
						(rowData.bins[dataP.filter] !== undefined && rowData.bins[dataP.filter] !== 0 && this.c.cascadePanes)
						|| !this.c.cascadePanes
						|| this.s.clearing
					)) {
						let row = this._addRow(
							dataP.display,
							dataP.filter,
							!this.c.viewTotal
							? rowData.bins[dataP.filter]
							: rowData.bins[dataP.filter] !== undefined
								? rowData.bins[dataP.filter]
								: 0,
							this.c.viewTotal
							? String(rowData.binsTotal[dataP.filter])
							: rowData.bins[dataP.filter],
							dataP.sort,
							dataP.type
						);

						// Find out if the filter was selected in the previous search, if so select it and remove from array.
						let selectIndex: number = selected.findIndex(function(element) {
							return element.filter === dataP.filter;
						});

						if (selectIndex !== -1) {
							row.select();
							selected.splice(selectIndex, 1);
						}
					}
				}
			}

			if ((colOpts.searchPanes !== undefined && colOpts.searchPanes.options !== undefined) ||
				colOpts.options !== undefined ||
				(this.customPaneSettings !== null && this.customPaneSettings.options !== undefined)) {
				let rows = this._getComparisonRows();

				for (let row of rows) {
					let selectIndex: number = selected.findIndex(function(element) {
						if (element.display === row.data().display) {
							return true;
						}
					});

					if (selectIndex !== -1) {
						row.select();
						selected.splice(selectIndex, 1);
					}
				}
			}

			// Add search options which were previously selected but whos results are no
			// longer present in the resulting data set.
			for (let selectedEl of selected) {
				let row = this._addRow(
					selectedEl.display,
					selectedEl.filter,
					0,
					this.c.viewTotal
						? selectedEl.total
						: 0, selectedEl.filter,
					selectedEl.filter
				);
				row.select();
			}

			this.s.dtPane.draw();
			this.s.dtPane.table().node().parentNode.scrollTop = scrollTop;
		}
	}

}
