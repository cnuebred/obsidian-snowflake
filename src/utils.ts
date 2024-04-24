export const base64ToArrayBuffer = (base64: string) => {
	var binaryString = atob(base64)
	var bytes = new Uint8Array(binaryString.length)
	for (var i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i)
	}
	return bytes.buffer
}
export const callback_time_buffer = (handler: number | NodeJS.Timeout | null  = null) => ({
	run_task_interval: (callback: () => void, timeout: number) => {
		const new_task_interval = setTimeout(callback, timeout)
		return callback_time_buffer(new_task_interval)
	},
	break_interval_and_push_task: (callback: () => void, timeout: number) => {
		if(handler)
			clearInterval(handler)
		return callback_time_buffer().run_task_interval(callback, timeout)
	}
})

/**
 * let callback_buffer = callback_time_buffer()
 * 
 * 
 * EVENT
 * callback_buffer = callback_buffer.break_interval_and_push_task(..., ...)
 * 
 */