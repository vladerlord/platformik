import { createServer } from 'nice-grpc'
import { WorkflowsServiceDefinition } from '@platformik/contracts-workflows-ts'
import type { Container } from '../container'
import { createWorkflowsGrpcService } from './service'

export function buildGrpcServer(container: Container) {
  const server = createServer()
  server.add(WorkflowsServiceDefinition, createWorkflowsGrpcService(container))

  return server
}
