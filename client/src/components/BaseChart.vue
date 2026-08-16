<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import type { ChartData, ChartOptions } from 'chart.js';

const props = withDefaults(
  defineProps<{
    type: 'bar' | 'line' | 'doughnut';
    data: ChartData;
    options?: ChartOptions;
    height?: number;
    showLegend?: boolean;
  }>(),
  { height: 260, showLegend: false },
);

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const FONT = {
  size: 11,
  family: "'Inter', 'PingFang SC', system-ui, sans-serif",
};

function buildOptions(): ChartOptions {
  const base: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: props.showLegend, position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 12 } },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
      },
    },
    ...props.options,
  };

  if (props.type === 'bar' || props.type === 'line') {
    base.scales = {
      x: { grid: { display: false }, ticks: { color: '#94a3b8', font: FONT } },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.15)' },
        ticks: { color: '#94a3b8', font: FONT, precision: 0 },
        beginAtZero: true,
      },
      ...(props.options?.scales as object),
    };
  }
  return base;
}

function render() {
  if (!canvas.value) return;
  chart?.destroy();
  chart = new Chart(canvas.value, {
    type: props.type,
    data: props.data,
    options: buildOptions(),
  });
}

onMounted(render);
watch(
  () => [props.data, props.type],
  () => render(),
  { deep: true },
);
onUnmounted(() => chart?.destroy());
</script>

<template>
  <div class="relative w-full" :style="{ height: height + 'px' }">
    <canvas ref="canvas"></canvas>
  </div>
</template>
