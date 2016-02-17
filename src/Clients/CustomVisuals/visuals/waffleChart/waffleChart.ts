/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.visuals.samples {
    import SelectionManager = utility.SelectionManager;
    import DataRoleHelper = powerbi.data.DataRoleHelper;

    export interface WaffleChartLayout {
        rows: number;
        columns: number;
        totalArea: number;
    }

    export interface WaffleChartViewModel {
        count: number;
        labelsArray: Array<string>;
        identities: DataViewScopeIdentity[];
        objects: DataViewObjects[];
        values: Array<number>;
        paths: Array<string>;
    }

    export interface SingleWaffleChartInitOptions {
        root: D3.Selection;
        path: string;
    }

    export interface SingleWaffleChartUpdateOptions {
        x: number;
        y: number;
        width: number;
        height: number;
        fontFamily: string;
        value: number;
        text: string;
        identity: DataViewScopeIdentity;
        color: string;
    }

    export interface ISingleWaffleChart {
        init(options: SingleWaffleChartInitOptions): void;
        destroy?(): void;
        update?(options: SingleWaffleChartUpdateOptions): void;
    }

    // DevTools do not support yet `export const waffleChartRoleNames`.
    var waffleChartRoleNames = {
        category: 'Category',
        values: 'Values',
        minValue: 'MinValue',
        maxValue: 'MaxValue',
        paths: 'Paths'
    };

    // DevTools do not support yet `export const waffleChartCapabilities: VisualCapabilities`.
    var waffleChartCapabilities: VisualCapabilities = {
        dataRoles: [{
            name: waffleChartRoleNames.category,
            kind: VisualDataRoleKind.Grouping,
            displayName: data.createDisplayNameGetter('Role_DisplayName_Group'),
            description: data.createDisplayNameGetter('Role_DisplayName_GroupFunnelDescription')
        }, {
            name: waffleChartRoleNames.paths,
            kind: VisualDataRoleKind.Grouping,
            displayName: 'Paths',
            description: 'The value used to customize the shape of the data points',
            requiredTypes: [{ text: true }],
        }, {
            name: waffleChartRoleNames.values,
            kind: VisualDataRoleKind.Measure,
            displayName: data.createDisplayNameGetter('Role_DisplayName_Values'),
            description: data.createDisplayNameGetter('Role_DisplayName_ValuesDescription'),
            requiredTypes: [{ numeric: true }, { integer: true }],
        }, {
            name: waffleChartRoleNames.minValue,
            kind: VisualDataRoleKind.Measure,
            displayName: data.createDisplayNameGetter('Role_DisplayName_MinValue'),
            description: data.createDisplayNameGetter('Role_DisplayName_MinValueDescription'),
            requiredTypes: [{ numeric: true }, { integer: true }],
        }, {
            name: waffleChartRoleNames.maxValue,
            kind: VisualDataRoleKind.Measure,
            displayName: data.createDisplayNameGetter('Role_DisplayName_MaxValue'),
            description: data.createDisplayNameGetter('Role_DisplayName_MaxValueDescription'),
            requiredTypes: [{ numeric: true }, { integer: true }],
        }],
        dataViewMappings: [{
            categorical: {
                categories: {
                    for: { in: waffleChartRoleNames.category },
                    dataReductionAlgorithm: { top: {} }
                },
                values: {
                    group: {
                        by: waffleChartRoleNames.paths,
                        select: [
                            { bind: { to: waffleChartRoleNames.values } },
                            { bind: { to: waffleChartRoleNames.minValue } },
                            { bind: { to: waffleChartRoleNames.maxValue } },
                        ],
                        dataReductionAlgorithm: { top: {} }
                    }
                },
                // Specifies a constraint on the number of data rows supported by the visual.
                rowCount: { preferred: { min: 2 }, supported: { min: 0 } }
            },
        }],
        objects: {
            general: {
                displayName: data.createDisplayNameGetter('Visual_General'),
                properties: {
                    formatString: {
                        type: { formatting: { formatString: true } },
                    },
                },
            },
            dataPoint: {
                displayName: data.createDisplayNameGetter('Visual_DataPoint'),
                description: data.createDisplayNameGetter('Visual_DataPointDescription'),
                properties: {
                    defaultColor: {
                        displayName: data.createDisplayNameGetter('Visual_DefaultColor'),
                        type: { fill: { solid: { color: true } } }
                    },
                    fill: {
                        displayName: data.createDisplayNameGetter('Visual_Fill'),
                        type: { fill: { solid: { color: true } } }
                    },
                    fillRule: {
                        displayName: data.createDisplayNameGetter('Visual_Gradient'),
                        type: { fillRule: {} },
                        rule: {
                            inputRole: 'Gradient',
                            output: {
                                property: 'fill',
                                selector: ['Category'],
                            },
                        },
                    }
                }
            }
        },
        sorting: {
          default: {},
        },
    };

    // DevTools do not support yet `export const waffleChartProps`.
    var waffleChartProps = {
        dataPoint: {
            defaultColor: <DataViewObjectPropertyIdentifier>{ objectName: 'dataPoint', propertyName: 'defaultColor' },
            fill: { objectName: 'dataPoint', propertyName: 'fill' }
        },
    };

    export class WaffleChart implements IVisual {
        public static capabilities: VisualCapabilities = waffleChartCapabilities;

        private static DefaultText = 'Invalid DV';
        private root: D3.Selection;
        private dataView: DataView;
        private singleWaffleChartArray: Array<SingleWaffleChart>;
        private debug: DebugChart;
        private count: number;
        private defaultDataPointColor: string;
        private selectionManager: SelectionManager;

        public static converter(dataView: DataView): WaffleChartViewModel {
            // TODO: throw exception if there is no categorical view, however the following exception
            // is swallowed by Power BI Desktop and so it is useless.
            //if (!dataView.categorical) {
            //    throw 'No categorical data.';
            //}

            var labelsArray: Array<string>;
            var dataType: ValueTypeDescriptor;
            var identities: DataViewScopeIdentity[];
            var objects: DataViewObjects[];
            if (dataView.categorical.categories && dataView.categorical.categories.length > 0) {
                var category0 = dataView.categorical.categories[0]; 

                // Copy arrays.
                labelsArray = category0.values.slice();
                identities = category0.identity.slice();
                objects = category0.objects ? category0.objects.slice() : null;

                dataType = category0.source.type;
            }

            if (dataType && dataType.dateTime)
            {
                var formatter : IValueFormatter;
                for (var i = 0; i < labelsArray.length; i++) {
                    formatter = valueFormatter.create({
                        format: 'O',
                        value: labelsArray[i],
                        value2: labelsArray[i],
                        tickCount: 6
                    });

                    labelsArray[i] = formatter.format(labelsArray[i]);
                }
            }

            var minValues: Array<number>;
            var maxValues: Array<number>;
            var paths: Array<string>;
            var totals: Array<number>;

            if (dataView.categorical.values && dataView.metadata && dataView.metadata.columns) {
                var categoricalValues = dataView.categorical.values;
                var metadataColumns = dataView.metadata.columns;

                var grouped = categoricalValues.grouped();
                var pathsGroups: Array<string> = [];
                for (var  i = 0; i < grouped.length; i++) {
                    var pathD = WaffleChart.sanitizePathD(grouped[i].name);
                    pathsGroups.push(pathD);
                }

                // This is necessary for backward compatability with Power BI Desktop client Dec 2015
                // and Jan 2016. 
                if (DataRoleHelper === undefined) {
                    DataRoleHelper = powerbi.visuals.DataRoleHelper;
                }

                // Arrays are got by reference, so, modifying the array modifies the source too.
                var currentPathIndex: number = 0;
                for (var i = 0; i < categoricalValues.length; i++) {
                    var localValues = categoricalValues[i].values;
                    var col = metadataColumns[i];

                    // Note: 'roles' is the wrong way to do this, I don't know why, but use 'source' instead.
                    if (DataRoleHelper.hasRole(categoricalValues[i].source, waffleChartRoleNames.values)) {
                        if (!totals) {
                            totals = new Array(localValues.length);
                            for (var j = 0; j < totals.length; j++) {
                                totals[j] = 0;
                            }
                            paths = new Array(localValues.length);
                        }

                        // totals += localValues
                        WaffleChart.sumValues(totals, localValues, paths, pathsGroups[currentPathIndex]);

                        // These values were for the current path, move to the next one.
                        currentPathIndex++;
                    }
                    else if (DataRoleHelper.hasRole(categoricalValues[i].source, waffleChartRoleNames.minValue)) {
                        minValues = localValues;
                    }
                    else if (DataRoleHelper.hasRole(categoricalValues[i].source, waffleChartRoleNames.maxValue)) {
                        maxValues = localValues;
                    }
                    else {
                        console.log("No matching source ...");
                    }
                }
            }

            //// TODO: Find something appropriate to show when the categorical data does not follow the capabilities.
            //if (!totals) {
            //    totals = [1, 2, 3, 4, 5, 6, 7];
            //}

            var count : number;
            if (labelsArray && totals) {
                count = Math.max(labelsArray.length, totals.length);
            }
            else if (labelsArray) {
                count = labelsArray.length;
            }
            else if (totals) {
                count = totals.length;
            }
            else {
                console.log('No categories or values.');
            }

            // If there are no values so far, create an array full of zeros.
            if (totals === undefined) {
                totals = [];
                for (var i = 0; i < count; i++) {
                    totals.push(0);
                }
            }

            if (totals) {
                // Normalize values.
                var maxValue: number = Math.max.apply(null, totals);

                // If there are max values (and optionally min values), calculate percentage.
                // If numbers are bellow 100, consider totals are already percentages.
                // Otherwise, calculate percentages considering the max value in totals to be the 100%.
                // TODO: Unit test these calculations.
                if (maxValues) {
                    for (var i = 0; i < totals.length; i++) {
                        var localMaxValue = maxValues[i];
                        var localMinValue =  minValues && minValues[i] ? minValues[i] : 0; 
                        var range =localMaxValue - localMinValue;

                        // TODO: Validate that totals[i] is greater than minValues[i].
                        totals[i] = Math.round((totals[i] - localMinValue) * 100 / range);
                    }
                }
                else if (maxValue > 100) {
                    // Do cross multiplication.
                    console.log("maxValue: " + maxValue);
                    for (var i = 0; i < totals.length; i++) {
                        totals[i] = Math.round(totals[i] * 100 / maxValue);
                    }
                }
            }

            var viewModel: WaffleChartViewModel = {
                labelsArray: labelsArray,
                identities: identities,
                objects: objects,
                values: totals,
                paths: paths,
                count: count,
            };

            return viewModel;
        }

        public init(options: VisualInitOptions): void {
            this.defaultDataPointColor = 'Coral';

            this.selectionManager = new SelectionManager({ hostServices: options.host });

            this.root = d3.select(options.element.get(0))
                .append('svg');
                
            this.debug = new DebugChart();
            this.debug.init(options);
        }

        private initWaffles(newCount: number, paths: Array<string>): void {
            // TODO: To improve performance, skip this method if count and paths have not changed.

            // We need to remove all waffles before creating new ones.
            if (this.singleWaffleChartArray) {
                for (var i = 0; i < this.count; i++) {
                    this.singleWaffleChartArray[i].remove();
                }
            }

            this.count = newCount;
            
            // Create new waffles.
            this.singleWaffleChartArray = new Array();
            for (var i = 0; i < this.count; i++) {
                this.singleWaffleChartArray[i] = new SingleWaffleChart();
                this.singleWaffleChartArray[i].init({
                    root: this.root,
                    path: paths ? paths[i] : null,
                });
            }
        }

        private initSelectionManager(identities: DataViewScopeIdentity[]) {
            var selection = d3.selectAll('g.singleWaffle');

            // Bound data with join-by-index.
            selection.data(identities);

            // Using a local variable to avoid errors later when using 'this'.
            var selectionManager = this.selectionManager;

            this.root.on('click', function() {
                selectionManager.clear().then(() => selection.style('opacity', 1))
            });

            selection.on('click', function (d) {
                selectionManager.select(SelectionId.createWithId(d)).then((ids) => {
                    if (ids.length > 0) {
                        selection.style('opacity', 0.5);
                        d3.select(this).style('opacity', 1);
                    } else {
                        selection.style('opacity', 1);
                    }
                });

                d3.event.stopPropagation();
            });
        }

        public update(options: VisualUpdateOptions) {
            var debugMessage = undefined;
            
            // Adding try, because something started failing after upgrading Desktop client to January 2016 version.
            try {
                if (!options.dataViews || !options.dataViews[0]) return;
                var dataView = this.dataView = options.dataViews[0];
                debugMessage = JSON.stringify(dataView.categorical.categories);
                var viewport = options.viewport;

                var viewModel: WaffleChartViewModel = WaffleChart.converter(dataView);
                this.initWaffles(viewModel.count, viewModel.paths);
                this.initSelectionManager(viewModel.identities);
            }
            catch (err) {
                console.log(err);
            }

            //this.debug.update(options, debugMessage);

            if (dataView.metadata && dataView.metadata.objects) {
                var defaultColor = DataViewObjects.getFillColor(dataView.metadata.objects, waffleChartProps.dataPoint.defaultColor);
                if (defaultColor) {
                    this.defaultDataPointColor = defaultColor;
                }
            }

            this.root.attr({
                'height': viewport.height,
                'width': viewport.width
            });

            var bestLayout = WaffleChart.getBestLayout(options.viewport, this.count);
            var waffleViewport = WaffleChart.getWaffleSize({
                width: options.viewport.width / bestLayout.columns,
                height: options.viewport.height / bestLayout.rows,
            });

            var globalX = viewport.width / 2 - waffleViewport.width * bestLayout.columns / 2;
            var globalY = viewport.height / 2 - waffleViewport.height * bestLayout.rows / 2;
            for (var i = 0; i < this.count; i++) {
                var localX = globalX + waffleViewport.width  * (i % bestLayout.columns);
                var localY = globalY + waffleViewport.height * Math.floor(i / bestLayout.columns);

                this.singleWaffleChartArray[i].update({
                    x: localX,
                    y: localY,
                    width: waffleViewport.width,
                    height: waffleViewport.height,
                    fontFamily: 'tahoma',
                    value: viewModel.values && viewModel.values[i] ? viewModel.values[i] : 0,
                    text: viewModel.labelsArray && viewModel.labelsArray[i] ? viewModel.labelsArray[i] : '(Blank)',
                    identity: viewModel.identities && viewModel.identities[i] ? viewModel.identities[i] : null,
                    color: viewModel.objects && viewModel.objects[i] ? WaffleChart.getColor(viewModel.objects[i], this.defaultDataPointColor) : this.defaultDataPointColor,
                });
            }
        }
        
        private static getColor(objects: DataViewObjects, defaultDataPointColor: string): string {
            var colorHelper = new ColorHelper(new DataColorPalette(), waffleChartProps.dataPoint.fill, defaultDataPointColor);
            return colorHelper.getColorForMeasure(objects, "");
        }

        // Return null if path[d] contains invalid characters.
        private static sanitizePathD(pathD: string) {
            var regex = /[bdfgijknopruwxy]+/gi;
            if (regex.test(pathD)) {
                return null;
            }
            return pathD;
        }

        private static sumValues(totals: Array<number>, localValues: Array<number>, paths: Array<string>, currentPath:string) {
            for (var i = 0; i < localValues.length; i++) {
                if (localValues[i]) {
                    paths[i] = currentPath;
                    totals[i] += localValues[i];
                }
            }
        }

        private static getBestLayout(viewport: IViewport, count: number): WaffleChartLayout {
            var bestLayout = {
                rows: 0,
                columns: 0,
                totalArea: 0,
            };

            // Find the best layout (rows x columns) by choosing the layout with larger area.
            for (var i = 1; i <= count;  i++) {
                for (var j = 1; j <= count;  j++) {
                    if (i * j >= count) {
                        var currentArea : WaffleChartLayout = WaffleChart.calculateArea(viewport, count, i, j);
                        if (currentArea.totalArea > bestLayout.totalArea) {
                            bestLayout = currentArea
                        }
                    }
                }
            }

            return bestLayout;
        }

        private static calculateArea(viewport: IViewport, count: number, rows: number, columns: number): WaffleChartLayout {
            var waffleViewport: IViewport = WaffleChart.getWaffleSize({
                width: viewport.width / columns,
                height: viewport.height / rows,
            });

            var totalArea = waffleViewport.width * waffleViewport.height * count;

            return {
                rows: rows,
                columns: columns,
                totalArea: totalArea,
            };
        }

        private static getWaffleSize(viewport: IViewport): IViewport {
            // Cross-multiplications:
            //     600            : 800
            //     viewport.width : height
            //     width          : viewport.height

            if (viewport.width * 800 / 600 <= viewport.height) {
                return {
                    width: viewport.width,
                    height: viewport.width * 800 / 600
                };
            }

            return {
                width: viewport.height * 600 / 800,
                height: viewport.height
            };
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            var enumeration = new ObjectEnumerationBuilder();

            switch (options.objectName) {
                case 'dataPoint':
                    this.enumerateDataPoints(enumeration);
                    break;
            }

            return enumeration.complete();
        }

        private enumerateDataPoints(enumeration: ObjectEnumerationBuilder): void {
            enumeration.pushInstance({
                objectName: 'dataPoint',
                selector: null,
                properties: {
                    defaultColor: { solid: { color: this.defaultDataPointColor } }
                },
            });
            
            if (this.singleWaffleChartArray) {
                for (var i = 0; i < this.singleWaffleChartArray.length; i++) {
                    var singleWaffle = this.singleWaffleChartArray[i]; 

                    enumeration.pushInstance({
                        objectName: 'dataPoint',
                        displayName: singleWaffle.getText(),
                        selector: ColorHelper.normalizeSelector(SelectionId.createWithId(singleWaffle.getIdentity()).getSelector(), false),
                        properties: {
                            fill: { solid: { color: singleWaffle.getColor() } }
                        },
                    });
                } 
            }
        }

        public destroy(): void {
            console.log("Call to destroy()");
            this.root = null;
            for (var i = 0; i < this.count; i++) {
                this.singleWaffleChartArray[i].destroy();
            }
        }
    }

    export class SingleWaffleChart implements ISingleWaffleChart {
        private waffleG : D3.Selection;
        private backgroundRect: D3.Selection;
        private dotG : D3.Selection;
        private dotBackgroundRect: D3.Selection;
        private dotRect: SVGRect;
        private dotArray : Array<Array<D3.Selection>>;
        private textG : D3.Selection;
        private percentageText: D3.Selection;
        private descText: D3.Selection;
        private options: SingleWaffleChartUpdateOptions;

        public remove() {
            this.waffleG.remove();
        }

        public init(options: SingleWaffleChartInitOptions): void {
            this.waffleG = options.root
                .append('g');

            // Add a class to query this groups by class.
            this.waffleG.attr('class', 'singleWaffle');

            this.backgroundRect = this.waffleG
                .append('rect');

            this.dotG = this.waffleG
                .append('g');

            this.dotBackgroundRect = this.dotG
                .append('rect');

            this.dotArray = new Array();
            for (var i = 0; i < 10; i++) {
                this.dotArray[i] = new Array(10);
            
                for (var j = 0; j < 10; j++) {
                    if (options.path) {
                        this.dotArray[i][j] = this.dotG
                            .append('path')
                            .attr('d', options.path);
                    }
                    else {
                        this.dotArray[i][j] = this.dotG
                            .append('circle');
                    }
                }
            }

            // dotArray[i][j][0][0] is a SVGPathElement.
            this.dotRect = this.dotArray[0][0][0][0].getBBox();

            this.textG = this.waffleG
                .append('g');

            this.percentageText = this.textG
                .append('text')
                .style('cursor', 'pointer')
                .style('stroke', 'Red')
                .style('stroke-width', '0px')
                .style('font-weight', 'bold')
                .attr('text-anchor', 'middle');

            this.descText = this.textG
                .append('text')
                .style('cursor', 'pointer')
                .style('stroke', 'Red')
                .style('stroke-width', '0px')
                .attr('text-anchor', 'middle');
        }

        public update(options: SingleWaffleChartUpdateOptions) {
            this.options = options;
            
            this.waffleG
                .attr('transform', 'matrix(1 0 0 1 ' + options.x + ' ' + options.y + ')');

            this.backgroundRect
                .style({
                    //'fill': 'LightCyan',
                    fill: 'transparent',
                    'width': options.width,
                    'height': options.height,
                });

            var dotGMargin = 20;
            var dotGX = dotGMargin;
            var dotGY = dotGMargin;
            this.dotG
                .classed('foo', true)
                .attr("transform", function(d){
                    return "matrix(1 0 0 1 " + dotGX + " " + dotGY + ")";
                });

            var dotGHeight = Math.min(options.height, options.width);
            var chartSide = 0;
            if (dotGHeight >= dotGMargin * 2) {
                chartSide = dotGHeight - dotGMargin * 2;
            }

            this.dotBackgroundRect.style({
                //'fill': 'LightCyan',
                fill: 'transparent',
                'width': chartSide,
                'height': chartSide,
            });

            var percentage = options.value;
            var percentageString = percentage.toString() + '%';

            var dataPointSide = chartSide / 10;
            var radio: number = null;
            var scaleValue: number = null;
            var padding: number = 3;

            if (this.dotRect && this.dotRect.height > 0 && this.dotRect.width > 0) {
                // Data point is a path.
                // Calculate scale using the largest of height or width to make sure the path will stay within
                // the data point bounds.
                scaleValue = 0;
                if (dataPointSide >= padding) {
                    scaleValue = (dataPointSide - padding) / Math.max(this.dotRect.height, this.dotRect.width);
                }
            }
            else {
                // Data point is a circle.
                radio = dataPointSide / 2;
            }

            for (var i = 9; i >= 0; i--) {
                for (var j = 0; j < 10; j++) {
                    this.dotArray[i][j]
                        .style({
                            'fill': percentage-- > 0 ? this.options.color : 'LightBlue',
                        });
                        
                    if (radio !== null) {
                        this.dotArray[i][j].attr({
                            'r': radio,
                            'cy': radio + dataPointSide * i,
                            'cx': radio + dataPointSide * j,
                        });
                    }
                    else {
                        this.dotArray[i][j].attr({
                            'transform': 'translate(' + (dataPointSide * j) + ' ' + (dataPointSide * i) + ') scale(' + scaleValue + ')',
                        });
                    }
                }
            }

            var textGX = 0;
            var textGY = Math.min(options.height, options.width);
            var textGHeight = Math.max(options.height, options.width) - textGY;
            this.textG
                .attr("transform", "matrix(1 0 0 1 " + textGX + " " + textGY + ")");
            
            // Divide by 2, because there are 2 lines of code.
            // And divide by 3 because the 15% on the top and 15% on the bottom should be margin.
            var percentageTextMargin = textGHeight / 2 / 6;

            var fontSize = textGHeight / 2 - percentageTextMargin * 2;
            var percentageTextY = fontSize / 2 + percentageTextMargin;

            this.percentageText.style({
                'fill': this.options.color,
                'font-size': fontSize + 'px',
                'font-family': options.fontFamily,
            }).text(
                percentageString)
            .attr({
                'y': percentageTextY + 'px',
                'x': options.width / 2,
            });

            var descTextY = textGHeight / 2 + fontSize / 2 + percentageTextMargin;

            this.descText.style({
                'fill': 'DarkSlateGray',
                'font-size': fontSize + 'px',
                'font-family': options.fontFamily,
            }).text(
                this.options.text)
            .attr({
                'y': descTextY + 'px',
                'x': options.width / 2,
            });
        }

        public destroy(): void {
        }
        
        public getText(): string {
            return this.options.text;
        }
        
        public getIdentity(): DataViewScopeIdentity {
            return this.options.identity;
        }
        
        public getColor(): string {
            return this.options.color;
        }
    }
    
    export class DebugChart {
        private root: D3.Selection;
        private fo: D3.Selection;
        
        public init(options: VisualInitOptions): void {
            this.root = d3.select(options.element.get(0))
                .select('svg');
        }
        
        public update(options: VisualUpdateOptions, message: string) {
            var viewport = options.viewport;
            var dataView = options.dataViews[0];
            var categoricalValues = dataView.categorical.values;
            
            if (this.fo) {
                this.fo.remove();
            }
                
            this.fo = this.root.append('foreignObject');
            
            this.fo.attr({
                'x': 0,
                'y': 0,
                'height': viewport.height,
                'width': viewport.width
            });
                        
            var foBody = this.fo.append('xhtml:body');
            
            var p = foBody.append('p');
            p.attr('style', 'font-size:11px;')

            if (message) {
                var text = p.text(message);
            }
            else {
                var text = p.text(JSON.stringify(dataView.categorical));
            }
        }
    }
}


