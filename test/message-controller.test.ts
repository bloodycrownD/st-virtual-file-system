import { describe, expect, it, vi } from 'vitest'
import { createMessageController } from '@/app/controllers/message-controller'
import { createMessagePipeline } from '@/app/services/message/message-pipeline'

describe('message-controller', () => {
  it('routes MESSAGE_RECEIVED to pipeline.run with kind and args', () => {
    const pipeline = createMessagePipeline()
    const run = vi.spyOn(pipeline, 'run')
    const controller = createMessageController(pipeline)

    controller.onMessageReceived(7)

    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith({ kind: 'MESSAGE_RECEIVED', args: [7] })
  })

  it('swallows pipeline errors so dispatch does not throw', () => {
    const pipeline = createMessagePipeline()
    vi.spyOn(pipeline, 'run').mockImplementation(() => {
      throw new Error('boom')
    })
    const controller = createMessageController(pipeline)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => controller.onMessageEdited(3)).not.toThrow()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
