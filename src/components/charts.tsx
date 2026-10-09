import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * Small chart set for the Progress tab: a donut, a bar chart and a line chart.
 * Colours are passed in as hex strings so each chart is correct in light and
 * dark mode. Text is drawn in ink colours, never in a series colour.
 */

export type DonutSegment = { key: string; value: number; color: string };

/** Ring split into segments, with a 2 px gap between them and content in the middle. */
export function DonutChart({ size, strokeWidth, segments, trackColor, children }: {
  size: number; strokeWidth: number; segments: DonutSegment[]; trackColor: string; children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = segments.filter((segment) => segment.value > 0);
  const total = shown.reduce((sum, segment) => sum + segment.value, 0);
  const gap = shown.length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        {total > 0 ? shown.map((segment) => {
          const length = (segment.value / total) * circumference;
          const visible = Math.max(0.5, length - gap);
          const start = offset;
          offset += length;
          return (
            <Circle
              key={segment.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${visible} ${circumference - visible}`}
              strokeDashoffset={-start}
              // Start at 12 o'clock and run clockwise.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        }) : null}
      </Svg>
      {children ? <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">{children}</View> : null}
    </View>
  );
}

export type BarDatum = { key: string; value: number; valueLabel: string; label: string; sublabel?: string };

/** One bar per item, anchored to the baseline, with its value above and label below. */
export function BarChart({ data, color, emptyColor, inkColor, mutedColor, height = 120 }: {
  data: BarDatum[]; color: string; emptyColor: string; inkColor: ColorValue; mutedColor: ColorValue; height?: number;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <View style={styles.barRow} accessibilityRole="image">
      {data.map((item) => {
        const barHeight = item.value > 0 ? Math.max(6, Math.round((item.value / max) * height)) : 4;
        return (
          <View key={item.key} style={styles.barColumn} accessible accessibilityLabel={`${item.label} ${item.sublabel ?? ''}: ${item.valueLabel}`}>
            <View style={[styles.barArea, { height: height + 18 }]}>
              <Text style={[styles.barValue, { color: inkColor }]} numberOfLines={1}>{item.valueLabel}</Text>
              <View style={[styles.bar, { height: barHeight, backgroundColor: item.value > 0 ? color : emptyColor }]} />
            </View>
            <Text style={[styles.barLabel, { color: inkColor }]} numberOfLines={1}>{item.label}</Text>
            {item.sublabel ? <Text style={[styles.barSublabel, { color: mutedColor }]} numberOfLines={1}>{item.sublabel}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export type LinePoint = { key: string; value: number; label: string };

/** A 0 to 100 % line with a soft area under it. Values are plotted in the order given. */
export function PercentLineChart({ points, color, gridColor, surfaceColor, mutedColor, height = 120, accessibilityLabel }: {
  points: LinePoint[]; color: string; gridColor: string; surfaceColor: string; mutedColor: ColorValue; height?: number; accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const axisWidth = 34;
  const padTop = 8;
  const padBottom = 6;
  const plotWidth = Math.max(0, width - axisWidth - 6);
  const plotHeight = height - padTop - padBottom;
  const y = (value: number) => padTop + plotHeight - (Math.min(100, Math.max(0, value)) / 100) * plotHeight;
  const x = (index: number) => axisWidth + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z` : '';
  const showMarkers = points.length <= 12;
  const labelIndexes = points.length <= 1 ? [0] : points.length <= 4 ? points.map((_, index) => index) : [0, Math.floor((points.length - 1) / 2), points.length - 1];

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="percentArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0, 50, 100].map((tick) => <Line key={tick} x1={axisWidth} x2={width - 6} y1={y(tick)} y2={y(tick)} stroke={gridColor} strokeWidth={1} />)}
            {area ? <Path d={area} fill="url(#percentArea)" /> : null}
            {points.length > 1 ? <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {showMarkers ? points.map((point, index) => <Circle key={point.key} cx={x(index)} cy={y(point.value)} r={4} fill={color} stroke={surfaceColor} strokeWidth={2} />) : null}
          </Svg>
        ) : null}
        {[100, 50, 0].map((tick) => <Text key={tick} style={[styles.axisLabel, { color: mutedColor, top: y(tick) - 7 }]}>{tick}%</Text>)}
      </View>
      <View style={[styles.xLabels, { marginLeft: axisWidth }, labelIndexes.length === 1 && styles.xLabelsSingle]}>
        {labelIndexes.map((index) => <Text key={points[index]?.key ?? index} style={[styles.xLabel, { color: mutedColor }]}>{points[index]?.label ?? ''}</Text>)}
      </View>
    </View>
  );
}

/** A thin rounded progress bar from 0 to 100. */
export function ProgressBar({ value, color, trackColor, height = 6 }: { value: number; color: string; trackColor: ColorValue; height?: number }) {
  const percent = Math.min(100, Math.max(0, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: 'hidden' }}>
      <View style={{ width: `${percent}%`, height: '100%', borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barColumn: { flex: 1, alignItems: 'center' },
  barArea: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  bar: { width: '62%', maxWidth: 26, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  barSublabel: { fontSize: 9, marginTop: 1 },
  axisLabel: { position: 'absolute', left: 0, width: 30, fontSize: 9, textAlign: 'right' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginRight: 6 },
  xLabelsSingle: { justifyContent: 'center' },
  xLabel: { fontSize: 9 },
});
