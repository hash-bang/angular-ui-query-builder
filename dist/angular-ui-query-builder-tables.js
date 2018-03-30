'use strict';

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

angular.module('angular-ui-query-builder')

// qbTableSettings (provider) {{{
.provider('qbTableSettings', function () {
	var qbTableSettings = this;

	qbTableSettings.icons = {
		sortNone: 'fa fa-fw fa-sort text-muted',
		sortAsc: 'fa fa-fw fa-sort-alpha-asc text-primary',
		sortDesc: 'fa fa-fw fa-sort-alpha-desc text-primary'
	};

	qbTableSettings.export = {
		defaults: {
			format: 'xlsx'
		},
		formats: [{ id: 'xlsx', title: 'Excel (XLSX)' }, { id: 'csv', title: 'CSV' }, { id: 'json', title: 'JSON' }, { id: 'html', title: 'HTML (display in browser)' }],
		questions: [
			/*
   {
   	id: String, // Unique ID for each question (will be sent in submitted query)
   	type: String, // How to render the question. ENUM: 'text'
   	title: String, // The question to ask
   	default: String, // Default value of field if any
   	help: String, // Optional help text,
   },
   */
		]
	};

	qbTableSettings.$get = function () {
		return qbTableSettings;
	};

	return qbTableSettings;
})
// }}}

// qbTableUtilities (service) {{{
.service('qbTableUtilities', function () {
	return {
		/**
  * Return a human readable synopsis of a query
  * @param {object} query The query to summerise
  * @return {string} A short string summerising the query
  */
		getSynopsis: function getSynopsis(query) {
			var filters = _.keys(query).filter(function (i) {
				return !['sort', 'skip', 'limit', 'select'].includes(i);
			});

			return [filters.length ? filters.length + ' filters' : 'All records', query.sort ? query.sort.startsWith('-') ? 'sorted by ' + query.sort.substr(1) + ' (reverse order)' : 'sorted by ' + query.sort : null, query.limit ? 'limited to ' + query.limit + ' rows' : null, query.offset ? 'starting at record ' + query.skip : null, query.select ? 'selecting only ' + query.select.length + ' columns' : null].filter(function (i) {
				return i;
			}).join(', ');
		},

		/**
  * Find the dotted path to a specific query element by a predicate
  * @param {object} query The query to search
  * @returns {string|false} Either the found path of the item or false
  */
		find: function find(query, predicate) {
			var searchExpr = _.isFunction(predicate) ? predicate : _.matches(predicate);
			var foundPath;
			var deepSearcher = function deepSearcher(node, path) {
				if (searchExpr(node, path.slice(path.length - 1))) {
					foundPath = path;
					return true;
				} else if (_.isArray(node)) {
					return node.some(function (v, k) {
						return deepSearcher(v, path.concat(k));
					});
				} else if (_.isObject(node)) {
					return _.some(node, function (v, k) {
						return deepSearcher(v, path.concat(k));
					});
				}
			};

			var res = deepSearcher(query, []);
			return res ? foundPath : false;
		},

		/**
  * Utlility function to return an escaped expression within a RegExp
  * @param {string} text The text to escape
  * @returns {string} The escaped expression
  */
		escapeRegExp: function escapeRegExp(text) {
			return String(text).replace(/(\W)/g, '\\$1');
		},

		/**
  * Utility to reverse quoting a RegExp
  * @param {string} text The escaped regular expression to reverse
  * @returns {string} The unescaped expression
  */
		unescapeRegExp: function unescapeRegExp(text) {
			return String(text).replace(/\\(\W)/g, '$1');
		}

	};
})
// }}}

// qbTable (directive) {{{
/**
* Directive applied to a table element to indicate that we should manage that table via angular-ui-query
* @param {Object} qbTable The query object to modify
* @param {boolean} stickyThead Anything within the `thead` section of the table should remain on the screen while scrolling
* @param {boolean} stickyTfoot Anything within the `tfoot` section of the table should remain on the screen while scrolling
* @emits qbTableQueryChange Emitted to child elements as (e, query) when the query object changes
*/
.directive('qbTable', function () {
	return {
		scope: {
			qbTable: '=?',
			stickyThead: '<?',
			stickyTfoot: '<?'
		},
		restrict: 'AC',
		controller: ['$attrs', '$element', '$scope', 'qbTableSettings', function controller($attrs, $element, $scope, qbTableSettings) {
			var $ctrl = this;
			$ctrl.query = $scope.qbTable; // Copy into $ctrl so children can access it / $watch it

			$ctrl.$broadcast = function (msg) {
				for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
					args[_key - 1] = arguments[_key];
				}

				return $scope.$broadcast.apply($scope, [msg].concat(args));
			}; // Rebind broadcast so its accessible from children
			$ctrl.$on = function (event, cb) {
				return $scope.$on(event, cb);
			};

			$ctrl.setField = function (field, value) {
				if (value == undefined) {
					// Remove from query
					delete $ctrl.query[field];
					return;
				}

				switch (field) {
					case 'sort':
						if ($ctrl.query.sort === value) {
							// If already sorting by field switch the sort direction
							$ctrl.query.sort = '-' + value;
						} else if ($ctrl.query.sort === '-' + value) {
							// If reverse sorting switch the right way up again
							$ctrl.query.sort = value;
						} else {
							// Just set the sorting
							$ctrl.query.sort = value;
						}
						break;
					default:
						$scope.qbTable[field] = value;
				}
			};

			$element.addClass('qb-table');
			$scope.$watch('stickyThead', function () {
				return $element.toggleClass('qb-sticky-thead', $scope.stickyThead || $attrs.stickyThead === '');
			});
			$scope.$watch('stickyTfoot', function () {
				return $element.toggleClass('qb-sticky-tfoot', $scope.stickyTfoot || $attrs.stickyTfoot === '');
			});
		}]
	};
})
// }}}

// qbCol (directive) {{{
/**
* Directive for header elements to add angular-ui-query functionality
* @param {Object} ^qbTable.qbTable The query Object to mutate
* @param {string} qbCol The field to operate on
* @param {string} [sortable=q] Indicates that the column should switch to being sorted if the user clicks on it, if a value is specified that is used instead of `q` as the sort field
*
* @example
* <thead>
*   <tr>
*     <td qb-col="name" sortable>Name</td>
*   </tr>
* </thead>
*/
.directive('qbCol', function () {
	return {
		scope: {
			qbCol: '@', // The field to operate on
			sortable: '@'
		},
		require: '^qbTable',
		restrict: 'A',
		transclude: true,
		controller: ['$attrs', '$element', '$scope', 'qbTableSettings', function controller($attrs, $element, $scope, qbTableSettings) {
			var $ctrl = this;

			$scope.qbTableSettings = qbTableSettings;

			// Sanity checks {{{
			var unSanityChecks = $scope.$watchGroup(['qbTable', 'sortable'], function () {
				if ($attrs.sortable === '' && !$scope.qbTable) console.warn('Added qb-col + sortable onto element', $element, 'but no qb-table query has been assigned on the table element!');
				unSanityChecks();
			});
			// }}}

			// Sort functionality {{{
			$scope.canSort = false; // True if either sortable has a specific value or is at least present
			$scope.isSorted = false; // False, 'asc', 'desc'

			$ctrl.$onInit = function () {
				$scope.canSort = $scope.sortable || $attrs.sortable === '';
				$element.toggleClass('sortable', $scope.canSort);
			};

			$scope.$watch('qbTable.query.sort', function (sorter) {
				var sortField = $scope.sortable || $scope.qbCol;

				if (!sorter) {
					$scope.isSorted = false;
				} else if (angular.isArray(sorter) && sorter.some(function (i) {
					return i == sortField;
				}) || sorter == sortField) {
					$scope.isSorted = 'asc';
				} else if (angular.isArray(sorter) && sorter.some(function (i) {
					return i == '-' + sortField;
				}) || sorter == '-' + sortField) {
					$scope.isSorted = 'desc';
				} else {
					$scope.isSorted = false;
				}
			});

			$scope.toggleSort = function () {
				if ($scope.sortable) {
					// Sort by a specific field
					$scope.qbTable.setField('sort', $scope.sortable);
				} else if ($scope.qbCol && $attrs.sortable === '') {
					// Has attribute but no value - assume main key if we have one
					$scope.qbTable.setField('sort', $scope.qbCol);
				}
			};
			// }}}

			$element.addClass('qb-col');
		}],
		link: function link(scope, element, attrs, parentScope) {
			scope.qbTable = parentScope;
		},
		template: '\n\t\t<div class="qb-col-wrapper">\n\t\t\t<ng-transclude></ng-transclude>\n\t\t\t<a ng-if="canSort" ng-click="toggleSort()" class="qb-col-right">\n\t\t\t\t<i class="{{\n\t\t\t\t\tisSorted == \'asc\' ? qbTableSettings.icons.sortAsc\n\t\t\t\t\t: isSorted == \'desc\' ? qbTableSettings.icons.sortDesc\n\t\t\t\t\t: qbTableSettings.icons.sortNone\n\t\t\t\t}}"></i>\n\t\t\t</a>\n\t\t</div>\n\t'
	};
})
// }}}

// qbCell (directive) {{{
/**
* Directive for cell elements within a table
* @param {Object} ^qbTable.qbTable The query Object to mutate
* @param {boolean} [selector] Whether the cell should act as a select / unselect prompt, if any value bind to this as the selection variable
* @param {function} [onSelect] Function to run when the selection value changes. Called as ({value})
*
* @emits qbTableCellSelectMeta Issued by the meta-selector element to peer selection elements that the selection criteria has changed. Called as (arg) where arg is 'all', 'none', 'invert'
* @emits qbTableCellSelect Issued by a regular selector element to broadcast its state has changed
* @emits qbTableCellSelectStatus Sent to one or more child elements as (array) to enquire their status, used to figure out if everything / partial / no items are selected. Each item is expected to add its status to `status` as a boolean
*
* @example
* <td qb-cell selector="row.selected"></td>
*/
.directive('qbCell', function () {
	return {
		scope: {
			selector: '=?',
			onSelect: '&?'
		},
		require: '^qbTable',
		restrict: 'A',
		transclude: true,
		controller: ['$attrs', '$element', '$scope', '$timeout', 'qbTableSettings', function controller($attrs, $element, $scope, $timeout, qbTableSettings) {
			var $ctrl = this;

			$scope.qbTableSettings = qbTableSettings;

			// Meta selection support {{{
			// A cell `isMeta` if it detects its located in the `thead` section of a table
			$scope.isMeta = $element.parents('thead').length > 0;

			if ($scope.isMeta) {
				$timeout(function () {
					return $scope.qbTable.$on('qbTableCellSelect', function () {
						// Ask all children what their status is
						var status = [];
						$scope.qbTable.$broadcast('qbTableCellSelectStatus', status);

						$scope.metaStatus = status.every(function (i) {
							return i;
						}) ? 'all' : status.some(function (i) {
							return i;
						}) ? 'some' : 'none';
					});
				});
			}
			// }}}

			// Selection support {{{
			$scope.isSelector = 'selector' in $attrs;
			$scope.$watch('selector', function () {
				if ($scope.isSelector) $element.toggleClass('selector', $scope.isSelector);

				if ($scope.isSelector && !$scope.isMeta) $element.parents('tr').toggleClass('selected', !!$scope.selector);
			});

			// Respond to clicking anywhere in the 'TD' tag
			if ($scope.isSelector && !$scope.isMeta) {
				$element.on('click', function (e) {
					return $scope.$apply(function () {
						$scope.selector = !$scope.selector;
						if ($scope.onSelect) $scope.onSelect({ value: $scope.selector });
						$scope.qbTable.$broadcast('qbTableCellSelect');
					});
				});
			}

			// Handle meta interaction
			$scope.metaSelect = function (type) {
				return $scope.qbTable.$broadcast('qbTableCellSelectMeta', type);
			};

			// Bind to event listener and respond to selection directives from meta element
			if ($scope.isSelector && !$scope.isMeta) {
				// If we're a standard per-row minion respond to certain events
				$timeout(function () {

					$scope.qbTable.$on('qbTableCellSelectMeta', function (e, type) {
						switch (type) {
							case 'all':
								$scope.selector = true;break;
							case 'invert':
								$scope.selector = !$scope.selector;break;
							case 'none':
								$scope.selector = false;break;
							default:
								throw new Error('Unknown selection type: ' + type);
						}
						$scope.qbTable.$broadcast('qbTableCellSelect'); // Trigger a recount of what is/isn't selected
					});

					$scope.qbTable.$on('qbTableCellSelectStatus', function (e, status) {
						return status.push($scope.selector);
					});
				});
			}
			// }}}

			// Style up the selector
			$element.addClass('qb-cell');
		}],
		link: function link(scope, element, attrs, parentScope) {
			scope.qbTable = parentScope;
		},
		template: '\n\t\t<ng-transclude></ng-transclude>\n\t\t<div ng-if="isSelector && isMeta" class="btn-group">\n\t\t\t<a class="btn btn-default dropdown-toggle" data-toggle="dropdown">\n\t\t\t\t<i class="fa fa-lg fa-fw" ng-class="metaStatus == \'all\' ? \'fa-check-square-o text-primary\' : metaStatus == \'some\' ? \'fa-minus-square-o\' : \'fa-square-o\'"></i>\n\t\t\t\t<i class="fa fa-caret-down"></i>\n\t\t\t</a>\n\t\t\t<ul class="dropdown-menu">\n\t\t\t\t<li><a ng-click="metaSelect(\'all\')">All</a></li>\n\t\t\t\t<li><a ng-click="metaSelect(\'invert\')">Invert</a></li>\n\t\t\t\t<li><a ng-click="metaSelect(\'none\')">None</a></li>\n\t\t\t</ul>\n\t\t</div>\n\t\t<div ng-if="isSelector && !isMeta">\n\t\t\t<i class="fa fa-lg fa-fw" ng-class="selector ? \'fa-check-square-o\' : \'fa-square-o\'"></i>\n\t\t</div>\n\t'
	};
})
// }}}

// qbPagination {{{
/**
* Directive to add table pagination
* NOTE: Any transcluded content will be inserted in the center of the pagination area
* @param {Object} ^qbTable.qbTable The query Object to mutate
*/
.directive('qbPagination', function () {
	return {
		scope: {},
		require: '^qbTable',
		restrict: 'EA',
		transclude: true,
		controller: ['$attrs', '$scope', 'qbTableSettings', function controller($attrs, $scope, qbTableSettings) {
			var $ctrl = this;

			$scope.qbTableSettings = qbTableSettings;

			$scope.canPrev = true;
			$scope.canNext = true;

			$scope.$watchGroup(['qbTable.query.limit', 'qbTable.query.skip'], function (sorter) {
				$scope.canPrev = $scope.qbTable.query.skip > 0;
				$scope.canNext = !$scope.total || $scope.qbTable.query.skip + $scope.qbTable.query.limit < $scope.total;
			});

			$scope.navPageRelative = function (pageRelative) {
				if (pageRelative == -1) {
					$scope.qbTable.setField('skip', Math.min(($scope.qbTable.query.skip || 0) - ($scope.qbTable.query.limit || 10), 0));
				} else if (pageRelative == 1) {
					$scope.qbTable.setField('skip', ($scope.qbTable.query.skip || 0) + ($scope.qbTable.query.limit || 10), 0);
				} else {
					throw new Error('Unsupported page move: ' + pageRelative);
				}
			};
		}],
		link: function link(scope, element, attrs, parentScope) {
			scope.qbTable = parentScope;
		},
		template: '\n\t\t<nav>\n\t\t\t<ul class="pager">\n\t\t\t\t<li ng-class="canPrev ? \'\' : \'disabled\'" class="previous"><a ng-click="navPageRelative(-1)"><i class="fa fa-arrow-left"></i></a></li>\n\t\t\t\t<ng-transclude class="text-center"></ng-transclude>\n\t\t\t\t<li ng-class="canNext ? \'\' : \'disabled\'" class="next"><a ng-click="navPageRelative(1)"><i class="fa fa-arrow-right"></i></a></li>\n\t\t\t</ul>\n\t\t</nav>\n\t'
	};
})
// }}}

// qbExport {{{
/**
* Directive to export a table via a query
* NOTE: This element draws a simple 'Export...' button by default but can be replaced by any valid transcluded HTML. Simply call `exportPrompt()` to action
* @param {Object} query The query Object to use when exporting
* @param {Object} spec The specification object of the collection
* @param {string} url The URL endpoint to redirect to for the query to be executed (typically something like `/api/widgets`)
*
* @example Simple export button
* <qb-export query="myQuery" spec="mySpec"></qb-export>
* @example Custom button
* <qb-export query="myQuery" spec="mySpec">
*   <a class="btn btn-primary" ng-click="exportPrompt()">Export this list</a>
* </qb-export>
*/
.directive('qbExport', function () {
	return {
		scope: {
			query: '<',
			spec: '<',
			url: '@'
		},
		transclude: true,
		restrict: 'EA',
		controller: ['$element', '$httpParamSerializer', '$scope', '$timeout', '$window', 'qbTableSettings', 'qbTableUtilities', function controller($element, $httpParamSerializer, $scope, $timeout, $window, qbTableSettings, qbTableUtilities) {
			var $ctrl = this;

			$scope.qbTableSettings = qbTableSettings;

			$scope.settings = {}; // Set in $scope.exportPrompt()

			$scope.isShowing = false;
			$scope.exportPrompt = function () {
				$scope.settings = angular.extend(angular.copy(qbTableSettings.export.defaults), {
					query: _($scope.query).omitBy(function (v, k) {
						return ['skip', 'limit'].includes(k);
					}).value(),
					columns: _.map($scope.spec, function (v, k) {
						v.id = k;
						v.title = _.startCase(k);
						v.selected = true;
						return v;
					}),
					questions: _(qbTableSettings.export.questions) // Populate questions with defaults
					.mapKeys(function (v) {
						return v.id;
					}).mapValues(function (v) {
						return v.default;
					}).value()
				});

				$element.find('.modal').on('show.bs.modal', function () {
					return $timeout(function () {
						return $scope.isShowing = true;
					});
				}).on('hidden.bs.modal', function () {
					return $timeout(function () {
						return $scope.isShowing = false;
					});
				}).modal('show');
			};

			$scope.exportExecute = function () {
				var query = angular.extend($scope.settings.query, {
					select: $scope.settings.columns.filter(function (c) {
						return c.selected;
					}).map(function (c) {
						return c.id;
					}),
					format: $scope.settings.format
				}, $scope.settings.questions);

				$window.open($scope.url + '?' + $httpParamSerializer(query));
			};

			// Generate a readable synopsis of the query {{{
			$scope.querySynopsis;
			$scope.$watchGroup(['isShowing', 'settings.query'], function () {
				if (!$scope.isShowing) return; // Don't bother if we're not showing anything anyway
				$scope.querySynopsis = qbTableUtilities.getSynopsis($scope.settings.query);
			});
			// }}}

			// Generate a readable synopsis of the columns collapse {{{
			$scope.columnSynopsis;
			$scope.$watchGroup(['isShowing', function () {
				return _.get($scope.settings, 'columns', []).map(function (c) {
					return c.id + '=' + c.selected;
				}).join('&');
			}], function () {
				if (!$scope.isShowing) return; // Don't bother if we're not showing anything anyway
				$scope.columnSynopsis = $scope.settings.columns.filter(function (c) {
					return c.selected;
				}).length + ' columns';
			});
			// }}}
		}],
		template: '\n\t\t<div class="modal fade">\n\t\t\t<div class="modal-dialog modal-lg">\n\t\t\t\t<div ng-if="isShowing" class="modal-content">\n\t\t\t\t\t<div class="modal-header">\n\t\t\t\t\t\t<a class="close" data-dismiss="modal"><i class="fa fa-times"></i></a>\n\t\t\t\t\t\t<h4 class="modal-title">Export</h4>\n\t\t\t\t\t</div>\n\t\t\t\t\t<div class="modal-body form-horizontal">\n\t\t\t\t\t\t<div class="form-group">\n\t\t\t\t\t\t\t<label class="col-sm-3 control-label">Output format</label>\n\t\t\t\t\t\t\t<div class="col-sm-9">\n\t\t\t\t\t\t\t\t<select ng-model="settings.format" class="form-control">\n\t\t\t\t\t\t\t\t\t<option ng-repeat="format in qbTableSettings.export.formats track by format.id" value="{{format.id}}">{{format.title}}</option>\n\t\t\t\t\t\t\t\t</select>\n\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class="form-group">\n\t\t\t\t\t\t\t<label class="col-sm-3 control-label">Criteria</label>\n\t\t\t\t\t\t\t<div class="col-sm-9">\n\t\t\t\t\t\t\t\t<div class="panel-group" id="qb-export-criteria-{{$id}}">\n\t\t\t\t\t\t\t\t\t<div class="panel panel-default">\n\t\t\t\t\t\t\t\t\t\t<div class="panel-heading">\n\t\t\t\t\t\t\t\t\t\t\t<h4 class="panel-title">\n\t\t\t\t\t\t\t\t\t\t\t\t<a data-toggle="collapse" data-target="#qb-export-criteria-{{$id}}-query" data-parent="#qb-export-criteria-{{$id}}" class="btn-block collapsed">\n\t\t\t\t\t\t\t\t\t\t\t\t\t{{querySynopsis}}\n\t\t\t\t\t\t\t\t\t\t\t\t\t<i class="fa fa-caret-right pull-right"></i>\n\t\t\t\t\t\t\t\t\t\t\t\t</a>\n\t\t\t\t\t\t\t\t\t\t\t</h4>\n\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t\t\t<div id="qb-export-criteria-{{$id}}-query" class="panel-collapse collapse container">\n\t\t\t\t\t\t\t\t\t\t\t<ui-query-builder\n\t\t\t\t\t\t\t\t\t\t\t\tquery="settings.query"\n\t\t\t\t\t\t\t\t\t\t\t\tspec="spec"\n\t\t\t\t\t\t\t\t\t\t\t></ui-query-builder>\n\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class="form-group">\n\t\t\t\t\t\t\t<label class="col-sm-3 control-label">Columns</label>\n\t\t\t\t\t\t\t<div class="col-sm-9">\n\t\t\t\t\t\t\t\t<div class="panel-group" id="qb-export-columns-{{$id}}">\n\t\t\t\t\t\t\t\t\t<div class="panel panel-default">\n\t\t\t\t\t\t\t\t\t\t<div class="panel-heading">\n\t\t\t\t\t\t\t\t\t\t\t<h4 class="panel-title">\n\t\t\t\t\t\t\t\t\t\t\t\t<a data-toggle="collapse" data-target="#qb-export-columns-{{$id}}-columns" data-parent="#qb-export-columns-{{$id}}" class="btn-block collapsed">\n\t\t\t\t\t\t\t\t\t\t\t\t\t{{columnSynopsis}}\n\t\t\t\t\t\t\t\t\t\t\t\t\t<i class="fa fa-caret-right pull-right"></i>\n\t\t\t\t\t\t\t\t\t\t\t\t</a>\n\t\t\t\t\t\t\t\t\t\t\t</h4>\n\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t\t\t<div id="qb-export-columns-{{$id}}-columns" class="panel-collapse collapse row">\n\t\t\t\t\t\t\t\t\t\t\t<div class="col-xs-12">\n\t\t\t\t\t\t\t\t\t\t\t\t<table qb-table class="table table-hover">\n\t\t\t\t\t\t\t\t\t\t\t\t\t<thead>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<tr>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<th qb-cell selector></th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<th>Column</th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t</tr>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</thead>\n\t\t\t\t\t\t\t\t\t\t\t\t\t<tbody>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t<tr ng-repeat="col in settings.columns track by col.id">\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td qb-cell selector="col.selected"></td>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<td>{{col.title}}</td>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t</tr>\n\t\t\t\t\t\t\t\t\t\t\t\t\t</tbody>\n\t\t\t\t\t\t\t\t\t\t\t\t</table>\n\t\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div ng-repeat="question in qbTableSettings.export.questions track by question.id" class="form-group">\n\t\t\t\t\t\t\t<label class="col-sm-3 control-label">{{question.title}}</label>\n\t\t\t\t\t\t\t<div ng-switch="question.type" class="col-sm-9">\n\t\t\t\t\t\t\t\t<div ng-switch-when="text">\n\t\t\t\t\t\t\t\t\t<input type="text" ng-model="settings.questions[question.id]" class="form-control"/>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t<div ng-switch-default>\n\t\t\t\t\t\t\t\t\t<div class="alert alert-danger">\n\t\t\t\t\t\t\t\t\t\tUnknown question type: "{{question.type}}"\n\t\t\t\t\t\t\t\t\t\t<pre>{{question | json}}</pre>\n\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t<div ng-if="question.help" class="help-block">{{question.help}}</div>\n\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\t\t\t\t\t<div class="modal-footer">\n\t\t\t\t\t\t<div class="pull-left">\n\t\t\t\t\t\t\t<a class="btn btn-danger" data-dismiss="modal">Cancel</a>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t\t<div class="pull-right">\n\t\t\t\t\t\t\t<a ng-click="exportExecute()" class="btn btn-primary" data-dismiss="modal">Export</a>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>\n\t\t\t\t</div>\n\t\t\t</div>\n\t\t</div>\n\t\t<ng-transclude>\n\t\t\t<a ng-click="exportPrompt()" class="btn btn-default">Export...</a>\n\t\t</ng-transclude>\n\t'
	};
})
// }}}

// qbSearch {{{
/**
* Directive to automatically populate a generic search into a query via a single textbox
* NOTE: Any transcluded content will replace the basic `<input/>` template. Bind to `search` to set the search criteria and fire `submit()` to submit the change, 'clear()' to clear the search
* @param {Object} query The query object to populate
* @param {Object} spec The specification object of the collection
*/
.directive('qbSearch', function () {
	return {
		scope: {
			query: '=',
			spec: '<'
		},
		restrict: 'AE',
		transclude: true,
		controller: ['$scope', '$rootScope', 'qbTableUtilities', function controller($scope, $rootScope, qbTableUtilities) {
			var $ctrl = this;

			$scope.search = '';

			$scope.submit = function () {
				if (!$scope.search) return $scope.clear();

				var searchQuery = {
					$comment: 'search',
					$or: _($scope.spec).pickBy(function (v) {
						return v.type == 'string';
					}).mapValues(function (v, k) {
						return [{ $regexp: qbTableUtilities.escapeRegExp($scope.search), options: 'i' }];
					}).value()
				};

				var existingQuery = qbTableUtilities.find($scope.query, { $comment: 'search' });
				if (existingQuery && _.isEqual(existingQuery, ['$comment'])) {
					// Existing - found at root level
					$scope.query = searchQuery;
				} else if (existingQuery && existingQuery[0] == '$and') {
					// Existing - Found within $and wrapper
					_.set($scope.query, existingQuery, searchQuery);
				} else if (_.isEqual(_.keys($scope.query), ['$and'])) {
					// Non-existing - Query is of form {$and: QUERY} --
					$scope.query.$and.push(searchQuery);
				} else if (_.isObject($scope.query)) {
					// Non-existing - Append as a single key $or
					$scope.query.$or = _($scope.spec).pickBy(function (v) {
						return v.type == 'string';
					}).map(function (v, k) {
						return _defineProperty({}, k, { $regexp: qbTableUtilities.escapeRegExp($scope.search), options: 'i' });
					}).value();
				} else {
					// Give up
					console.warn('Unable to place search query', searchQuery, 'within complex query', $scope.query);
				}

				// Inform the main query builder that we've changed something
				$rootScope.$broadcast('queryBuilder.change', $scope.query);
			};

			$scope.clear = function () {
				var existingQuery = qbTableUtilities.find($scope.query, { $comment: 'search' });
				if (existingQuery && _.isEqual(existingQuery, ['$comment'])) {
					// Existing - found at root level
					$scope.query = {};
				} else if (existingQuery && existingQuery[0] == '$and') {
					// Existing - Found within $and wrapper, unwrap and return to simple key/val format
					$scope.query = $scope.query.$and.find(function (v, k) {
						return v.$comment != 'search';
					});
				} else if (existingQuery) {
					// Existing - Delete by path
					_.unset($scope.query, existingQuery);
				} else {
					// Give up
					console.warn('Unable to clear search query within complex query', $scope.query);
				}
			};

			/**
   * Try and populate initial query
   * NOTE: This is currently only compatible with query.$or.0.*.$regexp level queries
   */
			$scope.check = function () {
				try {
					$scope.search = _.chain($scope.query).get('$or').first().values().first().get('$regexp').thru(function (v) {
						return qbTableUtilities.unescapeRegExp(v || '');
					}).value();
				} catch (e) {
					$scope.search = '';
				}
			};

			$ctrl.$onInit = function () {
				return $scope.check();
			};
		}],
		template: '\n\t\t<ng-transclude>\n\t\t\t<form ng-submit="submit()" class="form-inline">\n\t\t\t\t<div class="form-group">\n\t\t\t\t\t<div class="input-group">\n\t\t\t\t\t\t<input type="text" ng-model="search" class="form-control"/>\n\t\t\t\t\t\t<a ng-click="submit()" class="btn btn-default input-group-addon">\n\t\t\t\t\t\t\t<i class="fa fa-search"/>\n\t\t\t\t\t\t</a>\n\t\t\t\t\t</div>\n\t\t\t\t</div>\n\t\t\t</div>\n\t\t</ng-transclude>\n\t'
	};
});
// }}}