import { Service, ServiceStatus } from '../types';

/**
 * Checks if adding a new dependency would create a circular reference.
 * It does this by tracing the dependency chain of the `newDependencyId` to see
 * if it ever leads back to the `currentServiceId`.
 * @param currentServiceId - The ID of the service being edited.
 * @param newDependencyId - The ID of the service to be added as a dependency.
 * @param allSubmissions - The complete list of all services.
 * @returns `true` if a circular dependency would be created, otherwise `false`.
 */
export const isCircularDependency = (
  currentServiceId: string,
  newDependencyId: string,
  allSubmissions: Service[]
): boolean => {
  const traceDependencies = (startNodeId: string, targetId: string, path: Set<string>): boolean => {
    if (startNodeId === targetId) return true; // Cycle detected!

    path.add(startNodeId);

    const service = allSubmissions.find(s => s.submissionId === startNodeId);
    if (!service || !service.dependsOn || service.dependsOn.length === 0) {
      path.delete(startNodeId);
      return false; // Reached the end of a chain without finding a cycle.
    }

    for (const dependencyId of service.dependsOn) {
      if (path.has(dependencyId)) continue; // Already visited in this trace, skip.
      if (traceDependencies(dependencyId, targetId, path)) {
        return true; // Cycle found in a deeper path.
      }
    }

    path.delete(startNodeId);
    return false;
  };

  return traceDependencies(newDependencyId, currentServiceId, new Set());
};


/**
 * Retrieves a list of all prerequisite services for a given service that are not yet complete.
 * @param service - The service to check.
 * @param allSubmissions - The complete list of all services.
 * @returns An array of `Service` objects that are blocking the given service. An empty array means the service can start.
 */
export const getUncompletedDependencies = (service: Service, allSubmissions: Service[]): Service[] => {
    if (!service.dependsOn || service.dependsOn.length === 0) {
        return [];
    }
    
    // Find all dependency services and filter for those not marked as 'Completed'.
    return service.dependsOn
        .map(depId => allSubmissions.find(s => s.submissionId === depId))
        .filter((s): s is Service => !!s && s.status !== ServiceStatus.Completed);
};
